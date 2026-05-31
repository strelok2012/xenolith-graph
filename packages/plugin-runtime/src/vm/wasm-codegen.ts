// Phase 3 — WebAssembly code generator. Emits a raw WASM binary (no deps, no wabt) for the
// NUMERIC SUBSET of the IR: graphs whose vars + edges carry f64 only and whose nodes are
// drawn from {Tick, Sequence, SetVar, GetVar, Const, Add, Sub, Mul, Floor, Gt, Gte, Eq}.
//
// Why numeric-only: WASM has no native strings/arrays/objects. GC-types exist but the JS
// interop bridge eats most of the speedup. For audio DSP, ML inference, particle systems —
// graphs where the hot path is f64 math — WASM JITs to near-native code. Mixed graphs (the
// current fairqueue/spawn) should keep using `codegen.ts` (the JS path).
//
// Equivalence + bench live in `wasm-codegen.test.ts` / `wasm-codegen.bench.ts`.

import type { RtGraph, RtNode, RtPin, NodeDef } from './interpreter.js'

const dataIns  = (n: RtNode): RtPin[] => n.pins.filter((p) => p.kind === 'data' && p.direction === 'in')
const dataOuts = (n: RtNode): RtPin[] => n.pins.filter((p) => p.kind === 'data' && p.direction === 'out')
const execOuts = (n: RtNode): RtPin[] => n.pins.filter((p) => p.kind === 'exec' && p.direction === 'out')

// --- IR (re-used shape from codegen.ts) ---------------------------------------------------------

interface NodeIR {
  id: string; type: string; index: number
  state: Record<string, unknown> | undefined
  dataIns: RtPin[]; dataOuts: RtPin[]; execOuts: RtPin[]
  incoming: Array<{ srcIdx: number; outIdx: number } | null>
  execTarget: number[]
}
interface IR {
  nodes: NodeIR[]
  varIndex: Map<string, number>
  entriesByType: Map<string, number[]>
}

function buildIR(graph: RtGraph): IR {
  const nodes: NodeIR[] = graph.nodes.map((n, i) => ({
    id: n.id, type: n.type, index: i, state: n.state,
    dataIns: dataIns(n), dataOuts: dataOuts(n), execOuts: execOuts(n),
    incoming: [], execTarget: [],
  }))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const n of nodes) {
    n.incoming = new Array(n.dataIns.length).fill(null)
    n.execTarget = new Array(n.execOuts.length).fill(-1)
  }
  for (const e of graph.edges) {
    const dst = byId.get(e.to.node); const src = byId.get(e.from.node)
    if (!dst || !src) continue
    const inIdx  = dst.dataIns.findIndex((p) => p.id === e.to.pin)
    const outIdx = src.dataOuts.findIndex((p) => p.id === e.from.pin)
    if (inIdx >= 0 && outIdx >= 0 && dst.incoming[inIdx] === null) dst.incoming[inIdx] = { srcIdx: src.index, outIdx }
    const eOut = src.execOuts.findIndex((p) => p.id === e.from.pin)
    if (eOut >= 0) src.execTarget[eOut] = dst.index
  }
  const varIndex = new Map<string, number>()
  for (const n of nodes) {
    if ((n.type === 'GetVar' || n.type === 'SetVar') && typeof n.state?.['name'] === 'string') {
      const name = n.state['name'] as string
      if (!varIndex.has(name)) varIndex.set(name, varIndex.size)
    }
  }
  const entriesByType = new Map<string, number[]>()
  for (const n of nodes) {
    if (n.type !== 'Tick' && n.type !== 'Init') continue
    const arr = entriesByType.get(n.type) ?? []
    arr.push(n.index); entriesByType.set(n.type, arr)
  }
  return { nodes, varIndex, entriesByType }
}

// --- binary builder -----------------------------------------------------------------------------

/** Minimal raw WASM emitter — we only ever produce the bytes we actually use here, no general
 *  WAT assembler. ULEB128 for unsigned ints + section framing per the WebAssembly 1.0 spec. */
class WB {
  bytes: number[] = []
  u8(b: number): void { this.bytes.push(b & 0xff) }
  bytesRaw(arr: number[] | Uint8Array): void { for (const b of arr) this.u8(b) }
  uleb(n: number): void { while (n >= 0x80) { this.u8((n & 0x7f) | 0x80); n >>>= 7 } this.u8(n & 0x7f) }
  // signed LEB128 (used for i32.const operand — unused here but kept for completeness)
  sleb(n: number): void { let more = true; while (more) { const b = n & 0x7f; n >>= 7; const sign = b & 0x40; if ((n === 0 && !sign) || (n === -1 && sign)) more = false; else this.u8(b | 0x80); if (!more) this.u8(b) } }
  f64(x: number): void { const a = new ArrayBuffer(8); new DataView(a).setFloat64(0, x, true); const u = new Uint8Array(a); for (let i = 0; i < 8; i++) this.u8(u[i]!) }
  /** Wrap `inner` as a length-prefixed payload. Used for sections + function bodies. */
  section(id: number, inner: WB): void {
    this.u8(id); this.uleb(inner.bytes.length); this.bytesRaw(inner.bytes)
  }
  result(): Uint8Array { return new Uint8Array(this.bytes) }
}

// WASM opcodes used here. Spec section 5.4.
const OP = {
  END: 0x0b,
  LOCAL_GET: 0x20, LOCAL_SET: 0x21,
  I32_CONST: 0x41, I32_ADD: 0x6a,
  F64_LOAD: 0x2b, F64_STORE: 0x39, F64_CONST: 0x44,
  F64_ADD: 0xa0, F64_SUB: 0xa1, F64_MUL: 0xa2, F64_DIV: 0xa3,
  F64_FLOOR: 0x9c,
  F64_EQ: 0x61, F64_NE: 0x62, F64_LT: 0x63, F64_GT: 0x64, F64_LE: 0x65, F64_GE: 0x66,
  CALL: 0x10,
} as const

// --- emitters -----------------------------------------------------------------------------------

/** Numeric primitives are emitted as a postorder bytecode stream (WASM is a stack machine).
 *  Each pure pull pushes one f64 onto the value stack; each exec node consumes its inputs +
 *  optionally calls another node fn (for Sequence-style flow). */

function emitPullExpr(ir: IR, n: NodeIR, outIdx: number, code: WB): void {
  switch (n.type) {
    case 'Const': {
      const v = (n.state as Record<string, unknown>)?.['value']
      code.u8(OP.F64_CONST); code.f64(typeof v === 'number' ? v : 0)
      return
    }
    case 'GetVar': {
      const name = n.state?.['name']
      if (typeof name !== 'string') { code.u8(OP.F64_CONST); code.f64(0); return }
      const vi = ir.varIndex.get(name) ?? -1
      if (vi < 0) { code.u8(OP.F64_CONST); code.f64(0); return }
      // address = vi * 8, then f64.load align=3 offset=0
      code.u8(OP.I32_CONST); code.uleb(vi * 8)
      code.u8(OP.F64_LOAD); code.u8(3); code.uleb(0)
      return
    }
    case 'Add': case 'Sub': case 'Mul': {
      pullInput(ir, n, 0, code); pullInput(ir, n, 1, code)
      code.u8(n.type === 'Add' ? OP.F64_ADD : n.type === 'Sub' ? OP.F64_SUB : OP.F64_MUL)
      return
    }
    case 'Floor': {
      pullInput(ir, n, 0, code); code.u8(OP.F64_FLOOR); return
    }
    case 'Gt': case 'Gte': case 'Eq': {
      // i32 (0/1) → re-extend to f64 via conversion (WASM has no direct bool-to-f64 instr;
      // use f64.convert_i32_s = 0xb7). Cheap: bools live as 0.0/1.0 in our model.
      pullInput(ir, n, 0, code); pullInput(ir, n, 1, code)
      code.u8(n.type === 'Gt' ? OP.F64_GT : n.type === 'Gte' ? OP.F64_GE : OP.F64_EQ)
      code.u8(0xb7) // f64.convert_i32_s
      return
    }
    default:
      // Unsupported pure node — push 0 to keep stack consistent. The graph-validity check at
      // compile() time refuses to emit if any non-numeric primitive is used, so this is just
      // a safety net.
      code.u8(OP.F64_CONST); code.f64(0)
  }
}

function pullInput(ir: IR, n: NodeIR, i: number, code: WB): void {
  const inc = n.incoming[i]
  if (!inc) { code.u8(OP.F64_CONST); code.f64(0); return }
  emitPullExpr(ir, ir.nodes[inc.srcIdx]!, inc.outIdx, code)
}

/** A per-node function body: SetVar/Sequence/Tick. Pure nodes are inlined into their consumers,
 *  so only exec nodes get a function slot. Body byte sequence assumes locals = [] and arity () → ().
 *  All function bodies end with `OP.END` and have a leading u32 for "number of local-decl groups"
 *  (always 0 here — no locals). */
function emitNodeBody(ir: IR, n: NodeIR, fnIdxOf: Map<number, number>): Uint8Array {
  const code = new WB()
  code.uleb(0) // local-decl group count
  switch (n.type) {
    case 'Tick': case 'Init': {
      const t = n.execTarget[0]
      if (t !== undefined && t >= 0) {
        const fnIdx = fnIdxOf.get(t)
        if (fnIdx !== undefined) { code.u8(OP.CALL); code.uleb(fnIdx) }
      }
      break
    }
    case 'Sequence': {
      for (let i = 0; i < n.execTarget.length; i++) {
        const t = n.execTarget[i]
        if (t === undefined || t < 0) continue
        const fnIdx = fnIdxOf.get(t)
        if (fnIdx !== undefined) { code.u8(OP.CALL); code.uleb(fnIdx) }
      }
      break
    }
    case 'SetVar': {
      const name = n.state?.['name']
      if (typeof name === 'string') {
        const vi = ir.varIndex.get(name) ?? -1
        if (vi >= 0) {
          // address = vi * 8 (i32)
          code.u8(OP.I32_CONST); code.uleb(vi * 8)
          // value (f64) from input 0
          pullInput(ir, n, 0, code)
          // store: align=3 (8-byte aligned), offset=0
          code.u8(OP.F64_STORE); code.u8(3); code.uleb(0)
        }
      }
      // chain flow
      const t = n.execTarget[0]
      if (t !== undefined && t >= 0) {
        const fnIdx = fnIdxOf.get(t)
        if (fnIdx !== undefined) { code.u8(OP.CALL); code.uleb(fnIdx) }
      }
      break
    }
  }
  code.u8(OP.END)
  return code.result()
}

// --- the supported-set guard ---------------------------------------------------------------------

const SUPPORTED = new Set([
  'Tick', 'Init', 'Sequence', 'SetVar',
  'GetVar', 'Const', 'Add', 'Sub', 'Mul', 'Floor', 'Gt', 'Gte', 'Eq',
])

export function canCompileToWasm(graph: RtGraph): boolean {
  for (const n of graph.nodes) if (!SUPPORTED.has(n.type)) return false
  return true
}

// --- public API ---------------------------------------------------------------------------------

export interface WasmGraph {
  tick(entryType?: string): void
  getVar(name: string): number | undefined
  setVar(name: string, value: number): void
  reset(): void
  /** Raw module bytes — handy for the test/bench to assert "we actually emitted WASM". */
  readonly bytes: Uint8Array
}

export function wasmCodegen(graph: RtGraph, _defs: ReadonlyArray<NodeDef>): WasmGraph {
  if (!canCompileToWasm(graph)) throw new Error('wasmCodegen: graph uses non-numeric primitives — keep on the JS codegen path')
  const ir = buildIR(graph)

  // Collect impure nodes that need a function slot.
  const execNodes = ir.nodes.filter((n) => n.type === 'Tick' || n.type === 'Init' || n.type === 'Sequence' || n.type === 'SetVar')
  const fnIdxOf = new Map<number, number>()
  execNodes.forEach((n, i) => fnIdxOf.set(n.index, i))

  // Build the module: one type ((func)), N funcs, 1 memory exported, one tick export per entry
  // (we collapse all entries into a single tick fn for simplicity — entries by type fire in order).

  const module = new WB()
  // Magic + version
  module.bytesRaw([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])

  // ---- section 1: types ----
  // Only one type: () -> ()
  const typeSec = new WB()
  typeSec.uleb(1)            // num types
  typeSec.u8(0x60); typeSec.uleb(0); typeSec.uleb(0) // (func [] -> [])
  module.section(1, typeSec)

  // ---- section 3: functions ----
  // N functions, all of type 0
  const funcSec = new WB()
  funcSec.uleb(execNodes.length)
  for (let i = 0; i < execNodes.length; i++) funcSec.uleb(0)
  module.section(3, funcSec)

  // ---- section 5: memory ----
  // 1 page initial, no max
  const memSec = new WB()
  memSec.uleb(1); memSec.u8(0x00); memSec.uleb(1)
  module.section(5, memSec)

  // ---- section 7: exports ----
  // Export every entry-node fn under names "tick", "tick1", ... + "memory".
  // For prototype, callers only invoke "tick".
  const tickIdxs: number[] = []
  for (const [, idxs] of ir.entriesByType) for (const ni of idxs) {
    const fi = fnIdxOf.get(ni); if (fi !== undefined) tickIdxs.push(fi)
  }
  const exportSec = new WB()
  const exportCount = tickIdxs.length + 1 // +1 for memory
  exportSec.uleb(exportCount)
  for (let i = 0; i < tickIdxs.length; i++) {
    const name = i === 0 ? 'tick' : `tick${i}`
    const nameBytes = new TextEncoder().encode(name)
    exportSec.uleb(nameBytes.length); exportSec.bytesRaw(Array.from(nameBytes))
    exportSec.u8(0x00); exportSec.uleb(tickIdxs[i]!)
  }
  const mem = new TextEncoder().encode('memory')
  exportSec.uleb(mem.length); exportSec.bytesRaw(Array.from(mem))
  exportSec.u8(0x02); exportSec.uleb(0)
  module.section(7, exportSec)

  // ---- section 10: code ----
  const codeSec = new WB()
  codeSec.uleb(execNodes.length)
  for (const n of execNodes) {
    const body = emitNodeBody(ir, n, fnIdxOf)
    codeSec.uleb(body.length); codeSec.bytesRaw(Array.from(body))
  }
  module.section(10, codeSec)

  const bytes = module.result()
  // `BufferSource` in the DOM lib is strict about ArrayBuffer (not SharedArrayBuffer); our bytes
  // come from a fresh Uint8Array so the buffer is always plain — cast through `as BufferSource`.
  const wasmMod  = new WebAssembly.Module(bytes as unknown as BufferSource)
  const instance = new WebAssembly.Instance(wasmMod, {})
  const exports  = instance.exports as Record<string, unknown> & { memory: WebAssembly.Memory }
  const view = new DataView(exports.memory.buffer)

  const callTick = (entryType: string): void => {
    // First tick exported is always 'tick'; additional are tick1/tick2... but for typical use
    // entries are of one type ('Tick'), so just call it.
    if (entryType === 'Init' && typeof exports['init'] === 'function') (exports['init'] as () => void)()
    else if (typeof exports['tick'] === 'function') (exports['tick'] as () => void)()
  }

  return {
    bytes,
    tick(entryType = 'Tick'): void { callTick(entryType) },
    getVar(name): number | undefined { const vi = ir.varIndex.get(name); return vi === undefined ? undefined : view.getFloat64(vi * 8, true) },
    setVar(name, value): void {
      let vi = ir.varIndex.get(name)
      if (vi === undefined) { vi = ir.varIndex.size; ir.varIndex.set(name, vi) }
      view.setFloat64(vi * 8, value, true)
    },
    reset(): void { for (let i = 0; i < ir.varIndex.size * 8; i += 8) view.setFloat64(i, 0, true) },
  }
}
