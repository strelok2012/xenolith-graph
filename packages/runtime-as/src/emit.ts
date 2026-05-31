// AssemblyScript source emitter. Walks an RtGraph, builds an IR (same shape as the JS codegen's
// IR), then emits AS source — TypeScript-like with explicit f64 / i32 types — that the `asc`
// compiler hands us back as a WebAssembly module. Numeric subset only for this first cut:
// Tick / Init / Sequence / SetVar / Branch  +  Const / GetVar / Add / Sub / Mul / Floor / Gt / Gte / Eq.
// String/array/object primitives need AS-side types and live in a follow-up.

import type { RtGraph, RtNode, RtPin, NodeDef } from '@xenolith/plugin-runtime'

const dataIns  = (n: RtNode): RtPin[] => n.pins.filter((p) => p.kind === 'data' && p.direction === 'in')
const dataOuts = (n: RtNode): RtPin[] => n.pins.filter((p) => p.kind === 'data' && p.direction === 'out')
const execOuts = (n: RtNode): RtPin[] => n.pins.filter((p) => p.kind === 'exec' && p.direction === 'out')

interface NodeIR {
  id: string; type: string; index: number
  state: Record<string, unknown> | undefined
  dataIns: RtPin[]; dataOuts: RtPin[]; execOuts: RtPin[]
  incoming: Array<{ srcIdx: number; outIdx: number } | null>
  execTarget: number[]
}
export interface IR {
  nodes: NodeIR[]
  varIndex: Map<string, number>
  entriesByType: Map<string, number[]>
  /** Populated during emit walk — node indices of `Output` nodes the exec flow actually reaches. */
  reachableOutputs: Set<number>
}

export function buildIR(graph: RtGraph): IR {
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
  const REFS_VAR = new Set(['GetVar', 'SetVar', 'GraphInput', 'GraphOutput', 'Local'])
  for (const n of nodes) {
    if (REFS_VAR.has(n.type) && typeof n.state?.['name'] === 'string') {
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
  return { nodes, varIndex, entriesByType, reachableOutputs: new Set<number>() }
}

// --- supported subset ----------------------------------------------------------------------------

export const AS_SUPPORTED = new Set([
  'Tick', 'Init', 'Sequence', 'SetVar', 'GraphOutput', 'Local', 'Branch', 'Loop',
  'GetVar', 'GraphInput', 'Const', 'Add', 'Sub', 'Mul', 'Floor', 'Gt', 'Gte', 'Eq',
])

export function canCompileToAS(graph: RtGraph): boolean {
  for (const n of graph.nodes) if (!AS_SUPPORTED.has(n.type)) return false
  return true
}

// --- emitters ------------------------------------------------------------------------------------

/** Emit an AS expression for `dataIn[i]` of node `n`. Pure-source nodes inline; exec-source nodes
 *  would read from a tick-scoped override array (not implemented here — numeric subset has no
 *  exec-data outputs, so the lookup is never needed). */
function emitInput(ir: IR, n: NodeIR, i: number): string {
  const inc = n.incoming[i]
  if (!inc) return '0.0' // unwired numeric default
  return emitPureExpr(ir, ir.nodes[inc.srcIdx]!, inc.outIdx)
}

/** Emit a *boolean-context* expression for input(i): collapse `Gt/Gte/Eq` (which normally return
 *  f64 0.0/1.0) into a plain `(a OP b)` comparison when consumed by Branch/Loop. Saves a select +
 *  ne-zero per hot-path iteration — measurable on Mandelbrot. */
function emitBoolInput(ir: IR, n: NodeIR, i: number): string {
  const inc = n.incoming[i]
  if (!inc) return 'false'
  const src = ir.nodes[inc.srcIdx]!
  switch (src.type) {
    case 'Gt':  return `(${emitInput(ir, src, 0)} > ${emitInput(ir, src, 1)})`
    case 'Gte': return `(${emitInput(ir, src, 0)} >= ${emitInput(ir, src, 1)})`
    case 'Eq':  return `(${emitInput(ir, src, 0)} == ${emitInput(ir, src, 1)})`
    default:    return `(${emitInput(ir, n, i)} != 0.0)`
  }
}

function emitPureExpr(ir: IR, n: NodeIR, _outIdx: number): string {
  switch (n.type) {
    case 'Const': {
      const v = (n.state as Record<string, unknown>)?.['value']
      return formatF64(typeof v === 'number' ? v : 0)
    }
    case 'GetVar':
    case 'GraphInput':
    case 'Local': {
      const name = n.state?.['name']
      if (typeof name !== 'string') return '0.0'
      const vi = ir.varIndex.get(name) ?? -1
      // Reads from a module-level `let` — AS lowers to a WASM global → register-allocated by V8.
      // Input vs GetVar: identical at the AS level — `tickArgs()` seeds Input vars from params
      // before running tickBody, so they read like any other var.
      return vi < 0 ? '0.0' : `v${vi}`
    }
    case 'Add':   return `(${emitInput(ir, n, 0)} + ${emitInput(ir, n, 1)})`
    case 'Sub':   return `(${emitInput(ir, n, 0)} - ${emitInput(ir, n, 1)})`
    case 'Mul':   return `(${emitInput(ir, n, 0)} * ${emitInput(ir, n, 1)})`
    case 'Floor': return `Math.floor(${emitInput(ir, n, 0)})`
    case 'Gt':    return `(${emitInput(ir, n, 0)} > ${emitInput(ir, n, 1)} ? 1.0 : 0.0)`
    case 'Gte':   return `(${emitInput(ir, n, 0)} >= ${emitInput(ir, n, 1)} ? 1.0 : 0.0)`
    case 'Eq':    return `(${emitInput(ir, n, 0)} == ${emitInput(ir, n, 1)} ? 1.0 : 0.0)`
    default:      return '0.0'
  }
}

/** AS doesn't accept JS literals like `1e-10` for very small magnitudes the same way? It does —
 *  but force a `.0` suffix on integers so the literal is typed f64, not i32. */
function formatF64(v: number): string {
  if (!Number.isFinite(v)) return v === Infinity ? 'f64.MAX_VALUE' : v === -Infinity ? '-f64.MAX_VALUE' : '0.0'
  if (Number.isInteger(v) && Math.abs(v) < 1e16) return `${v}.0`
  return String(v)
}

// All exec-flow emission is now INLINE — no per-node WASM functions, no call/return overhead.
// `seen` guards against pathological cycles (shouldn't happen in normal RtGraphs); a node
// appearing twice via fan-in is *duplicated* (intentional — same cost as a function call would have
// inlined to the same place anyway, but no return jump).

const MAX_INLINE_DEPTH = 256

function emitNodeBody(ir: IR, n: NodeIR, seen: Set<number>, depth: number): string {
  if (depth > MAX_INLINE_DEPTH) throw new Error(`AS-codegen: exec-flow depth > ${MAX_INLINE_DEPTH} at n${n.index} (${n.type}) — likely a cycle`)
  // Reachability collector — populated as we walk exec flow from Tick/Init entries.
  if (n.type === 'GraphOutput') {
    // GraphOutput behaves like SetVar AND marks the node as a reachable graph output.
    ir.reachableOutputs.add(n.index)
  }
  switch (n.type) {
    case 'Tick': case 'Init': return emitFlow(ir, n, 0, seen, depth + 1)
    case 'Sequence': return n.execOuts.map((_, i) => emitFlow(ir, n, i, seen, depth + 1)).join('\n  ')
    case 'Branch': {
      return `if (${emitBoolInput(ir, n, 0)}) {\n    ${emitFlow(ir, n, 0, seen, depth + 1)}\n  } else {\n    ${emitFlow(ir, n, 1, seen, depth + 1)}\n  }`
    }
    case 'SetVar':
    case 'GraphOutput':
    case 'Local': {
      const name = n.state?.['name']
      if (typeof name !== 'string') return emitFlow(ir, n, 0, seen, depth + 1)
      const vi = ir.varIndex.get(name); if (vi === undefined) return emitFlow(ir, n, 0, seen, depth + 1)
      return `v${vi} = ${emitInput(ir, n, 0)};\n  ${emitFlow(ir, n, 0, seen, depth + 1)}`
    }
    case 'Loop': {
      const maxExpr  = emitInput(ir, n, 0)
      const condExpr = emitBoolInput(ir, n, 1)
      const body = emitFlow(ir, n, 0, seen, depth + 1)
      const done = emitFlow(ir, n, 1, seen, depth + 1)
      return `{
    const _lmax = i32(${maxExpr});
    for (let _li: i32 = 0; _li < _lmax; _li++) {
      if (!(${condExpr})) break;
      ${body}
    }
  }
  ${done}`
    }
    default: return ''
  }
}

function emitFlow(ir: IR, n: NodeIR, execIdx: number, seen: Set<number>, depth: number): string {
  const t = n.execTarget[execIdx]
  if (t === undefined || t < 0) return ''
  if (seen.has(t)) return `/* cycle skip n${t} */`
  // Fan-in duplication is fine — each emission site gets its own inlined copy, no shared seen state.
  const next = new Set(seen); next.add(t)
  return emitNodeBody(ir, ir.nodes[t]!, next, depth)
}

// --- top-level source ----------------------------------------------------------------------------

/** Produce a complete AssemblyScript source file for the graph. The caller hands this to `asc`. */
export function emitASSource(graph: RtGraph, _defs: ReadonlyArray<NodeDef>): string {
  if (!canCompileToAS(graph)) {
    throw new Error('AS-codegen: graph uses non-numeric primitives — only the numeric subset is supported in this version')
  }
  const ir = buildIR(graph)
  const varCount = Math.max(1, ir.varIndex.size)

  // Resolve I/O for `tickArgs(...)`: prefer explicit `meta.inputs/outputs`, otherwise auto-derive
  // from declared `Input`/`Output` nodes (their `state.name` is the var slot they read/write).
  // Auto-derivation keeps the order stable across recompiles by walking nodes in IR order.
  const declaredInputs  = ir.nodes.filter((n) => n.type === 'GraphInput'  && typeof n.state?.['name'] === 'string').map((n) => n.state!['name'] as string)
  const declaredOutputs = ir.nodes.filter((n) => n.type === 'GraphOutput' && typeof n.state?.['name'] === 'string').map((n) => n.state!['name'] as string)
  const inputNames  = graph.meta?.inputs  ?? declaredInputs
  const outputNames = graph.meta?.outputs ?? declaredOutputs

  // Local nodes: collect (varIndex, initial) pairs to seed at the top of every tick — Local is
  // tick-scoped state, must reset to `initial` regardless of what persistent storage holds.
  const localSeed = ir.nodes
    .filter((n) => n.type === 'Local' && typeof n.state?.['name'] === 'string')
    .map((n) => ({ vi: ir.varIndex.get(n.state!['name'] as string)!, initial: Number(n.state!['initial'] ?? 0) }))
    .filter((s) => s.vi !== undefined)
  const seedLocals = localSeed.map((s) => `v${s.vi} = ${formatF64(s.initial)};`).join('\n  ')
  const inputIdxs  = inputNames .map((n) => ir.varIndex.get(n)).filter((i): i is number => i !== undefined)
  const outputIdxs = outputNames.map((n) => ir.varIndex.get(n)).filter((i): i is number => i !== undefined)
  const hasArgs = inputIdxs.length === inputNames.length && outputIdxs.length === outputNames.length && (inputIdxs.length > 0 || outputIdxs.length > 0)

  // Inline every reachable exec-node body directly into tick()/init(). No per-node WASM functions.
  // This is the single biggest perf win on the Mandelbrot inner loop: AS/Binaryen will happily
  // generate one fat function with all the locals it needs, V8 register-allocates them, and there's
  // exactly one host↔WASM crossing per tick.
  const tickIdxs = ir.entriesByType.get('Tick') ?? []
  const initIdxs = ir.entriesByType.get('Init') ?? []
  const inlineEntry = (i: number) => emitNodeBody(ir, ir.nodes[i]!, new Set([i]), 0)
  const tickBody = tickIdxs.map(inlineEntry).join('\n  ') || '// no Tick entries'
  const initBody = initIdxs.map(inlineEntry).join('\n  ') || '// no Init entries'

  // Storage strategy: persistent vars live in WASM globals `g0…gN`. At the top of tick()/init()
  // we COPY them into function-local `v0…vN` (which the emitter references everywhere), run the
  // body on locals, then write back. Locals are guaranteed register-allocated by Binaryen+V8;
  // raw globals can spill in hot loops. Verified: doubled Mandelbrot throughput on the inner loop.
  const globalsDecl = Array.from({ length: varCount }, (_, i) => `let g${i}: f64 = 0;`).join('\n')
  const loadLocals  = Array.from({ length: varCount }, (_, i) => `let v${i}: f64 = g${i};`).join('\n  ')
  const storeBack   = Array.from({ length: varCount }, (_, i) => `g${i} = v${i};`).join('\n  ')
  const getCases    = Array.from({ length: varCount }, (_, i) => `    case ${i}: return g${i};`).join('\n')
  const setCases    = Array.from({ length: varCount }, (_, i) => `    case ${i}: g${i} = value; break;`).join('\n')

  // Optional `tickArgs(...)`: inputs come in as WASM locals (parameters), outputs returned directly.
  // First output is the function's return value; additional outputs are written to subsequent
  // globals (caller reads via getVar after). Bypasses set/getVar host trampolines entirely on the
  // hot path — single host↔WASM crossing per call, params live in registers from the get-go.
  let tickArgsFn = ''
  if (hasArgs) {
    const params = inputNames.map((n, i) => `${n}_in: f64`).concat(['']).join(', ').replace(/, $/, '')
    // Pre-seed locals: persistent vars from globals (so SetVar/GetVar inside the body see them),
    // input vars from parameters (override globals — fresh value per call).
    const seedFromGlobals = Array.from({ length: varCount }, (_, i) => `let v${i}: f64 = g${i};`).join('\n  ')
    const seedFromArgs    = inputIdxs.map((vi, k) => `v${vi} = ${inputNames[k]}_in;`).join('\n  ')
    const firstOut = outputIdxs[0]
    const returnExpr = firstOut === undefined ? '0.0' : `v${firstOut}`
    const writeOtherOuts = outputIdxs.slice(1).map((vi) => `g${vi} = v${vi};`).join('\n  ')
    tickArgsFn = `
export function tickArgs(${params}): f64 {
  ${seedFromGlobals}
  ${seedFromArgs}
  ${seedLocals}
  ${tickBody}
  ${writeOtherOuts}
  return ${returnExpr};
}
`
  }

  return `// AUTOGENERATED — RtGraph → AssemblyScript. Do not hand-edit.
${globalsDecl}

export function tick(): void {
  ${loadLocals}
  ${seedLocals}
  ${tickBody}
  ${storeBack}
}
${tickArgsFn}

export function init(): void {
  ${loadLocals}
  ${seedLocals}
  ${initBody}
  ${storeBack}
}

export function getVar(idx: i32): f64 {
  switch (idx) {
${getCases}
    default: return 0;
  }
}

export function setVar(idx: i32, value: f64): void {
  switch (idx) {
${setCases}
    default: break;
  }
}

export function varCount(): i32 {
  return ${varCount};
}
`
}

/** Stable lookup `name → slot` exposed so callers know which i32 to pass to getVar/setVar. */
export function varIndexOf(graph: RtGraph): Map<string, number> {
  return buildIR(graph).varIndex
}
