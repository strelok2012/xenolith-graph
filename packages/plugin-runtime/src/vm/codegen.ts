// Real JS code-generator. Builds an IR from `RtGraph + NodeDef[]`, then emits a single JS
// function via `new Function(...)`. Pure-pull collapses into inline expression trees (no closure
// chain), exec nodes become hoisted per-node functions called directly, vars/overrides/latched
// live in plain arrays indexed by stable slot ids — no Map lookups in the hot path. V8 sees
// monomorphic shapes and JITs the whole tick.
//
// This is Phase 2 of Runtime v2 (Phase 1 = `compiler.ts` baked-context, ~1.8×). Phase 3 will
// emit WAT from the same IR.
//
// Coverage: primitives used by spawn + allocate + the merged graph have hand-written emitters.
// Anything else falls back to a stub that calls `defs[type].run/evalPure(io)` — same perf as
// interp for those nodes; the rest of the graph still benefits.

import type { RtGraph, RtNode, RtPin, NodeDef, ExecIO } from './interpreter.js'
import type { VmValue } from './value.js'

const dataIns  = (n: RtNode): RtPin[] => n.pins.filter((p) => p.kind === 'data' && p.direction === 'in')
const dataOuts = (n: RtNode): RtPin[] => n.pins.filter((p) => p.kind === 'data' && p.direction === 'out')
const execOuts = (n: RtNode): RtPin[] => n.pins.filter((p) => p.kind === 'exec' && p.direction === 'out')

// --- IR -----------------------------------------------------------------------------------------

interface NodeIR {
  id: string
  type: string
  index: number          // 0..N-1 — used as the array slot base
  state: Record<string, unknown> | undefined
  dataIns: RtPin[]
  dataOuts: RtPin[]
  execOuts: RtPin[]
  /** Per dataIn (by index): the resolved source, or null if unwired. */
  incoming: Array<{ srcIdx: number; outIdx: number } | null>
  /** Per multi-input dataIn (by index): every wired source in edge order. */
  incomingAll: Array<Array<{ srcIdx: number; outIdx: number }>>
  /** Per execOut (by index): target node IR-index, or -1 if unwired. */
  execTarget: number[]
}

interface IR {
  nodes: NodeIR[]
  /** Flat slot id for (nodeIdx, outIdx). Total slots = sum of dataOuts.length over all nodes. */
  slotOf: number[][]    // slotOf[nodeIdx][outIdx] = global slot id
  totalSlots: number
  /** Stable var slots: every var name referenced by a GetVar/SetVar has an index. */
  varIndex: Map<string, number>
  /** Node IR-indices grouped by entry node type ('Tick', 'Init'). */
  entriesByType: Map<string, number[]>
}

function buildIR(graph: RtGraph): IR {
  const nodes: NodeIR[] = graph.nodes.map((n, i) => ({
    id: n.id, type: n.type, index: i,
    state: n.state, dataIns: dataIns(n), dataOuts: dataOuts(n), execOuts: execOuts(n),
    incoming: [], incomingAll: [], execTarget: [],
  }))
  const byId = new Map(nodes.map((n) => [n.id, n]))
  // Slot allocation: each node's data-outs get contiguous slots. Total slot count = sum.
  const slotOf: number[][] = []
  let slotCursor = 0
  for (const n of nodes) {
    const row: number[] = []
    for (let i = 0; i < n.dataOuts.length; i++) row.push(slotCursor++)
    slotOf.push(row)
  }
  // Edge resolution.
  for (const n of nodes) {
    n.incoming    = new Array(n.dataIns.length).fill(null)
    n.incomingAll = n.dataIns.map(() => [])
    n.execTarget  = new Array(n.execOuts.length).fill(-1)
  }
  for (const e of graph.edges) {
    const dst = byId.get(e.to.node); if (!dst) continue
    const src = byId.get(e.from.node); if (!src) continue
    // Data edge: connects src.dataOut[i] → dst.dataIn[j]
    const dstInIdx = dst.dataIns.findIndex((p) => p.id === e.to.pin)
    const srcOutIdx = src.dataOuts.findIndex((p) => p.id === e.from.pin)
    if (dstInIdx >= 0 && srcOutIdx >= 0) {
      if (dst.incoming[dstInIdx] === null) dst.incoming[dstInIdx] = { srcIdx: src.index, outIdx: srcOutIdx }
      dst.incomingAll[dstInIdx]!.push({ srcIdx: src.index, outIdx: srcOutIdx })
    }
    // Exec edge: connects src.execOut[i] → dst (single in by convention)
    const srcExecIdx = src.execOuts.findIndex((p) => p.id === e.from.pin)
    if (srcExecIdx >= 0) src.execTarget[srcExecIdx] = dst.index
  }
  // Var-name catalogue: scan GetVar/SetVar state.name.
  const varIndex = new Map<string, number>()
  const seeVar = (name: string): void => { if (!varIndex.has(name)) varIndex.set(name, varIndex.size) }
  for (const n of nodes) {
    if ((n.type === 'GetVar' || n.type === 'SetVar') && typeof n.state?.['name'] === 'string') seeVar(n.state['name'] as string)
  }
  // Entry-node groups (`Tick`, `Init`, …) — any node with no exec-IN is a candidate entry; we
  // just group by type so callers pass `entryType` like the interpreter does.
  const entriesByType = new Map<string, number[]>()
  for (const n of nodes) {
    if (n.type !== 'Tick' && n.type !== 'Init') continue
    const arr = entriesByType.get(n.type) ?? []
    arr.push(n.index); entriesByType.set(n.type, arr)
  }
  return { nodes, slotOf, totalSlots: slotCursor, varIndex, entriesByType }
}

// --- code emitters ------------------------------------------------------------------------------

/** Emit a JS expression that reads (or computes) data-out `outIdx` of node `n`. PURE nodes inline
 *  their body; EXEC nodes read from `ov[slot] ?? latched[slot]` (overrides set this tick, else
 *  last tick's latched value). */
function emitDataPull(ir: IR, n: NodeIR, outIdx: number, em: Emit): string {
  const emitter = PURE_EMITTERS[n.type]
  if (emitter) return emitter(ir, n, outIdx, em)
  const slot = ir.slotOf[n.index]![outIdx]!
  return `(ov[${slot}] !== U ? ov[${slot}] : la[${slot}])`
}

/** Emit a JS expression that pulls `dataIn[i]` of `n` (or `U` for the pin's default / undefined). */
function emitInput(ir: IR, n: NodeIR, i: number, em: Emit): string {
  const inc = n.incoming[i]
  if (!inc) {
    const def = n.dataIns[i]?.default
    return def === undefined ? 'U' : JSON.stringify(def)
  }
  return emitDataPull(ir, ir.nodes[inc.srcIdx]!, inc.outIdx, em)
}

/** Per-emission unique-name generator. EACH inlined expression gets its own temp ids so nested
 *  pulls (e.g. ObjectSet.key reading GetField — both touch `_o`) don't alias each other's locals. */
class Emit {
  private c = 0
  tmp(): string { return `_t${this.c++}` }
}

/** Wrap a value as number — mirrors `asNumber` from value.ts. Uses a fresh tmp each call. */
function N(em: Emit, x: string): string {
  const t = em.tmp()
  return `(typeof (${t}=${x}) === 'number' ? (${t} === ${t} && ${t} !== Infinity && ${t} !== -Infinity ? ${t} : 0) : typeof ${t} === 'boolean' ? (${t}?1:0) : typeof ${t} === 'string' ? (isFinite(+${t})?+${t}:0) : 0)`
}
function A(em: Emit, x: string): string { const t = em.tmp(); return `(Array.isArray(${t}=${x}) ? ${t} : [])` }
function B(em: Emit, x: string): string {
  const t = em.tmp()
  return `(typeof (${t}=${x}) === 'boolean' ? ${t} : typeof ${t} === 'number' ? ${t} !== 0 : typeof ${t} === 'string' ? ${t}.length > 0 : Array.isArray(${t}) ? ${t}.length > 0 : false)`
}

type PureEmitter = (ir: IR, n: NodeIR, outIdx: number, em: Emit) => string

/** Inline-emitters for pure primitives. Each returns a JS expression. */
const PURE_EMITTERS: Record<string, PureEmitter> = {
  Const:   (_, n) => JSON.stringify((n.state as Record<string, VmValue>)?.['value'] ?? 0),
  GetVar:  (ir, n) => { const name = n.state?.['name']; const vi = typeof name === 'string' ? ir.varIndex.get(name) ?? -1 : -1; return vi < 0 ? '0' : `(va[${vi}] !== U ? va[${vi}] : 0)` },
  Add:     (ir, n, _o, em) => `(${N(em, emitInput(ir, n, 0, em))} + ${N(em, emitInput(ir, n, 1, em))})`,
  Sub:     (ir, n, _o, em) => `(${N(em, emitInput(ir, n, 0, em))} - ${N(em, emitInput(ir, n, 1, em))})`,
  Mul:     (ir, n, _o, em) => `(${N(em, emitInput(ir, n, 0, em))} * ${N(em, emitInput(ir, n, 1, em))})`,
  Floor:   (ir, n, _o, em) => `Math.floor(${N(em, emitInput(ir, n, 0, em))})`,
  Gt:      (ir, n, _o, em) => `(${N(em, emitInput(ir, n, 0, em))} > ${N(em, emitInput(ir, n, 1, em))})`,
  Gte:     (ir, n, _o, em) => `(${N(em, emitInput(ir, n, 0, em))} >= ${N(em, emitInput(ir, n, 1, em))})`,
  Eq:      (ir, n, _o, em) => `(${emitInput(ir, n, 0, em)} === ${emitInput(ir, n, 1, em)})`,
  Length:  (ir, n, _o, em) => `(${A(em, emitInput(ir, n, 0, em))}).length`,
  GetField:(ir, n, _o, em) => { const f = JSON.stringify(String(n.state?.['field'] ?? '')); const t = em.tmp(); return `(${t} = ${emitInput(ir, n, 0, em)}, ${t} && typeof ${t} === 'object' && !Array.isArray(${t}) ? ${t}[${f}] : U)` },
  ObjectGet: (ir, n, _o, em) => { const o = em.tmp(), k = em.tmp(); return `(${o} = ${emitInput(ir, n, 0, em)}, ${k} = String(${emitInput(ir, n, 1, em)}), ${o} && typeof ${o} === 'object' && !Array.isArray(${o}) ? ${o}[${k}] : U)` },
  ObjectSet: (ir, n, _o, em) => { const o = em.tmp(), k = em.tmp(), v = em.tmp(); return `(${o} = ${emitInput(ir, n, 0, em)}, ${k} = String(${emitInput(ir, n, 1, em)}), ${v} = ${emitInput(ir, n, 2, em)}, ${o} && typeof ${o} === 'object' && !Array.isArray(${o}) ? Object.assign({}, ${o}, {[${k}]: ${v}}) : {[${k}]: ${v}})` },
  Repeat:   (ir, n, _o, em) => { const c = em.tmp(), it = em.tmp(); return `(${c} = Math.floor(${N(em, emitInput(ir, n, 1, em))}), ${it} = ${emitInput(ir, n, 0, em)}, ${c} > 0 && isFinite(${c}) ? (() => { const a = new Array(${c}); for (let i=0;i<${c};i++) a[i]=${it}; return a })() : [])` },
  Concat:   (ir, n, _o, em) => `[...${A(em, emitInput(ir, n, 0, em))}, ...${A(em, emitInput(ir, n, 1, em))}]`,
  Append:   (ir, n, _o, em) => `[...${A(em, emitInput(ir, n, 0, em))}, ${emitInput(ir, n, 1, em)}]`,
  Index:    (ir, n, _o, em) => { const a = em.tmp(); return `(${a}=${A(em, emitInput(ir, n, 0, em))}, ${a}[Math.floor(${N(em, emitInput(ir, n, 1, em))})])` },
  ArrayWrite: (ir, n, _o, em) => { const a = em.tmp(); return `(${a}=[...${A(em, emitInput(ir, n, 0, em))}], ${a}[Math.floor(${N(em, emitInput(ir, n, 1, em))})] = ${emitInput(ir, n, 2, em)}, ${a})` },
  Includes:   (ir, n, _o, em) => `${A(em, emitInput(ir, n, 0, em))}.includes(${emitInput(ir, n, 1, em)})`,
  // IndexAll(arr, idxs) → idxs.map(i => arr[i]) — gather values at given indices.
  IndexAll:   (ir, n, _o, em) => { const a = em.tmp(), idx = em.tmp(); return `(${a}=${A(em, emitInput(ir, n, 0, em))}, ${idx}=${A(em, emitInput(ir, n, 1, em))}, ${idx}.map(__i => ${a}[${N(em, '__i')}]))` },
  ArgMax:     (ir, n, _o, em) => { const a = em.tmp(); return `(${a}=${A(em, emitInput(ir, n, 0, em))}, ${a}.length===0 ? -1 : (() => { let __mi=0,__mv=${N(em, `${a}[0]`)}; for (let i=1;i<${a}.length;i++){ const __v=${N(em, `${a}[i]`)}; if(__v>__mv){__mv=__v;__mi=i;} } return __mi })())` },
  // FilterIndices(arr, item) → indices of subs where subs[i] is an array containing item.
  FilterIndices: (ir, n, _o, em) => { const a = em.tmp(), it = em.tmp(); return `(${a}=${A(em, emitInput(ir, n, 0, em))}, ${it}=${emitInput(ir, n, 1, em)}, (() => { const o=[]; for (let i=0;i<${a}.length;i++){ const __s=${a}[i]; if (Array.isArray(__s) && __s.includes(${it})) o.push(i); } return o })())` },
}

// --- exec emitters ------------------------------------------------------------------------------

type ExecEmitter = (ir: IR, n: NodeIR, em: Emit) => string

const EXEC_EMITTERS: Record<string, ExecEmitter> = {
  Tick:     (ir, n) => emitFlow(ir, n, 0),
  Init:     (ir, n) => emitFlow(ir, n, 0),
  Sequence: (ir, n) => n.execOuts.map((_, i) => emitFlow(ir, n, i)).join('\n'),
  Branch:   (ir, n, em) => `if (${B(em, emitInput(ir, n, 0, em))}) { ${emitFlow(ir, n, 0)} } else { ${emitFlow(ir, n, 1)} }`,
  SetVar:   (ir, n, em) => {
    const name = n.state?.['name']
    if (typeof name !== 'string') return emitFlow(ir, n, 0)
    const vi = ir.varIndex.get(name); if (vi === undefined) return emitFlow(ir, n, 0)
    const t = em.tmp()
    return `va[${vi}] = (${t} = ${emitInput(ir, n, 0, em)}, ${t} !== U ? ${t} : 0);\n${emitFlow(ir, n, 0)}`
  },
  ForEach:  (ir, n, em) => {
    const arrExpr = emitInput(ir, n, 0, em)
    const elemSlot = ir.slotOf[n.index]![0]
    const idxSlot  = ir.slotOf[n.index]![1]
    return `{ const _arr = ${A(em, arrExpr)}; for (let _fi = 0; _fi < _arr.length; _fi++) { ov[${elemSlot}] = _arr[_fi]; ov[${idxSlot}] = _fi; ${emitFlow(ir, n, 0)} } } ${emitFlow(ir, n, 1)}`
  },
  Loop: (ir, n, em) => {
    // input(0) = max (re-emit each call — V8 hoists trivial ones); input(1) = cond (re-emit
    // EVERY iteration so pure deps re-evaluate against the body's just-written vars).
    const maxExpr  = N(em, emitInput(ir, n, 0, em))
    const condExpr = B(em, emitInput(ir, n, 1, em))
    const idxSlot = ir.slotOf[n.index]![0]
    return `{ const _lmax = Math.floor(${maxExpr}); for (let _li = 0; _li < _lmax; _li++) { if (!(${condExpr})) break; ov[${idxSlot}] = _li; ${emitFlow(ir, n, 0)} } } ${emitFlow(ir, n, 1)}`
  },
}

function emitFlow(ir: IR, n: NodeIR, execIdx: number): string {
  const target = n.execTarget[execIdx]
  if (target === undefined || target < 0) return ''
  return `n${target}();`
}

/** Per-node JS function: declares the tmps it ended up needing, then the body. */
function emitNodeFunction(ir: IR, n: NodeIR): string {
  const em = new Emit()
  const emitter = EXEC_EMITTERS[n.type]
  const body = emitter ? emitter(ir, n, em) : `_fallbackRun(${n.index});`
  // Read counter AFTER emission so we know exactly how many temps the body referenced.
  const used = (em as unknown as { c: number }).c
  const decls = used > 0 ? `let ${Array.from({ length: used }, (_, i) => `_t${i}`).join(',')};\n  ` : ''
  return `function n${n.index}() {\n  ${decls}${body}\n}`
}

// --- public API ---------------------------------------------------------------------------------

export interface CompiledGraph {
  tick(entryType?: string): void
  getVar(name: string): VmValue | undefined
  setVar(name: string, value: VmValue): void
  reset(): void
  /** Inspect the emitted JS source — useful for debugging + bench reports. */
  readonly sourceCode: string
}

export function codegen(graph: RtGraph, defs: ReadonlyArray<NodeDef>): CompiledGraph {
  const ir = buildIR(graph)
  const defMap = new Map<string, NodeDef>(); for (const d of defs) defMap.set(d.type, d)

  // Emit each impure-or-entry node body as `function nK() { ... }`.
  const fns: string[] = []
  for (const n of ir.nodes) {
    const def = defMap.get(n.type)
    if (!def?.run) continue
    fns.push(emitNodeFunction(ir, n))
  }

  // Build the tick body: for the given entryType, call each entry node fn in declaration order.
  const tickCases: string[] = []
  for (const [type, idxs] of ir.entriesByType) {
    tickCases.push(`case ${JSON.stringify(type)}: ${idxs.map((i) => `n${i}();`).join(' ')} break;`)
  }
  const tickBody = `
    ${fns.join('\n')}
    // clear per-tick overrides
    for (let i = 0; i < ${ir.totalSlots}; i++) ov[i] = U;
    switch (et) {
      ${tickCases.join('\n      ')}
    }
    // latch overrides → cross-tick state
    for (let i = 0; i < ${ir.totalSlots}; i++) if (ov[i] !== U) la[i] = ov[i];
    for (const cb of afterCbs) cb();
  `

  // Construct vars and overrides arrays (typed-friendly shapes — same length always).
  const va: VmValue[]            = new Array(Math.max(1, ir.varIndex.size))
  const ov: Array<VmValue | typeof UNSET> = new Array(ir.totalSlots).fill(undefined)
  const la: Array<VmValue | undefined>    = new Array(ir.totalSlots).fill(undefined)
  const afterCbs: Array<() => void> = []

  // Fallback runner for unsupported types — preserves correctness for graphs that use primitives
  // we haven't hand-coded yet (Struct, Schema, ToMap, MapField, Gather*, etc.). Built per call to
  // share the same `va/ov/la` storage as the codegen via closures.
  const fallbackRunners: Array<() => void> = new Array(ir.nodes.length)
  for (const n of ir.nodes) {
    const def = defMap.get(n.type); if (!def?.run) continue
    const io = makeFallbackIO(ir, n, defMap, va, ov, la)
    fallbackRunners[n.index] = () => def.run!(io)
  }
  const _fallbackRun = (idx: number): void => { const fn = fallbackRunners[idx]; if (fn) fn() }

  // Build the master function. `U` is the sentinel for "no override this tick".
  const fn = new Function('va', 'ov', 'la', 'U', '_fallbackRun', 'et', 'afterCbs', tickBody) as (
    va: VmValue[],
    ov: Array<VmValue | undefined>,
    la: Array<VmValue | undefined>,
    U: undefined,
    _fallbackRun: (idx: number) => void,
    et: string,
    afterCbs: Array<() => void>,
  ) => void

  return {
    sourceCode: tickBody,
    tick(entryType = 'Tick'): void { fn(va, ov as VmValue[], la, undefined, _fallbackRun, entryType, afterCbs) },
    getVar(name): VmValue | undefined { const vi = ir.varIndex.get(name); return vi === undefined ? undefined : va[vi] },
    setVar(name, value): void {
      let vi = ir.varIndex.get(name)
      if (vi === undefined) { vi = va.length; ir.varIndex.set(name, vi); va.push(value); return }
      va[vi] = value
    },
    reset(): void {
      for (let i = 0; i < va.length; i++) va[i] = undefined as unknown as VmValue
      for (let i = 0; i < la.length; i++) la[i] = undefined
    },
  }
}

const UNSET = undefined

// --- fallback IO --------------------------------------------------------------------------------

/** Make an `ExecIO` for an unsupported node — shares `va/ov/la` with the generated tick fn so
 *  state stays consistent across fast-path and slow-path nodes. */
function makeFallbackIO(
  ir: IR, n: NodeIR, defMap: Map<string, NodeDef>,
  va: VmValue[], ov: Array<VmValue | undefined>, la: Array<VmValue | undefined>,
): ExecIO {
  // We need to be able to read pure outputs of other nodes through the same channels the codegen
  // uses (overrides / latched / pure-eval). Recreate the interpreter's pull paths against IR.
  const pullOut = (srcIdx: number, outIdx: number): VmValue | undefined => {
    const src = ir.nodes[srcIdx]!
    const slot = ir.slotOf[srcIdx]![outIdx]
    if (slot !== undefined && ov[slot] !== undefined) return ov[slot]
    const def = defMap.get(src.type)
    if (def?.evalPure) return def.evalPure(makeFallbackIO(ir, src, defMap, va, ov, la))[outIdx]
    if (!def && src.state) return src.state as VmValue
    return slot !== undefined ? la[slot] : undefined
  }
  return {
    node: { id: n.id, type: n.type, pins: [...n.dataIns, ...n.dataOuts, ...n.execOuts], state: n.state } as RtNode,
    input: (idx) => { const inc = n.incoming[idx]; return inc ? pullOut(inc.srcIdx, inc.outIdx) : (n.dataIns[idx]?.default as VmValue | undefined) },
    inputAll: (idx) => { const out: VmValue[] = []; for (const s of n.incomingAll[idx] ?? []) { const v = pullOut(s.srcIdx, s.outIdx); if (v !== undefined) out.push(v) } return out },
    state: (key) => n.state?.[key],
    getVar: (name) => { const vi = ir.varIndex.get(name); return vi === undefined ? undefined : va[vi] },
    setVar: (name, value) => {
      let vi = ir.varIndex.get(name)
      if (vi === undefined) { vi = va.length; ir.varIndex.set(name, vi); va.push(value); return }
      va[vi] = value
    },
    setOutput: (idx, value) => { const slot = ir.slotOf[n.index]![idx]; if (slot !== undefined) ov[slot] = value },
    flow: () => {/* fallback runners don't drive flow — only used for pure-only types currently. */},
    nodes: () => [],
  }
}
