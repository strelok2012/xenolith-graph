// Graph compiler — Runtime v2 prototype. Bakes a `RtGraph + NodeDef[]` into a `CompiledGraph`
// whose `tick()` is a single pre-resolved function chain. Same execution model as `Runtime`
// (entry nodes by type, exec push, data pull, vars + cross-tick latching), but ALL per-tick
// lookups are pre-computed at compile time:
//   - `nodeById`, `defByType`, `incoming{,All}`, `execTarget` indices built ONCE.
//   - Per-node `ExecIO` context allocated ONCE (interpreter rebuilds it per call via spread).
//   - Exec runners stored as direct function refs in a `Map<nodeId, ()=>void>` — Sequence/Branch
//     `flow()` resolves to a single fn call (interp walks two maps + a filter to do the same).
//   - Pure-pull memoisation IS NOT cached across exec nodes (overrides + vars change mid-tick),
//     but within one exec invocation the same data-out is recomputed only if the caller re-pulls.
//
// Equivalence with the interpreter is proven by `compiler.test.ts` on the same scenarios used
// for spawn/allocate equivalence — every VM-var snapshot matches after N ticks.

import type { RtGraph, RtNode, RtPin, ExecIO, NodeDef } from './interpreter.js'
import type { VmValue } from './value.js'

const dataIns  = (n: RtNode): RtPin[] => n.pins.filter((p) => p.kind === 'data' && p.direction === 'in')
const dataOuts = (n: RtNode): RtPin[] => n.pins.filter((p) => p.kind === 'data' && p.direction === 'out')
const execOuts = (n: RtNode): RtPin[] => n.pins.filter((p) => p.kind === 'exec' && p.direction === 'out')

export interface CompiledGraph {
  /** Run one tick (fires every node of `entryType`, default `Tick`). */
  tick(entryType?: string): void
  /** Listeners fired after every `tick()` returns. */
  onAfterTick(cb: () => void): () => void
  getVar(name: string): VmValue | undefined
  setVar(name: string, value: VmValue): void
  /** Wipe vars + latched outputs (lets a bench restart cleanly without re-compiling). */
  reset(): void
}

export function compile(graph: RtGraph, defs: ReadonlyArray<NodeDef>): CompiledGraph {
  const defMap = new Map<string, NodeDef>()
  for (const d of defs) defMap.set(d.type, d)
  const nodeById = new Map<string, RtNode>()
  for (const n of graph.nodes) nodeById.set(n.id, n)

  // Per-node pin-index slices baked once.
  const dataInsByNode  = new Map<string, RtPin[]>()
  const dataOutsByNode = new Map<string, RtPin[]>()
  const execOutsByNode = new Map<string, RtPin[]>()
  for (const n of graph.nodes) {
    dataInsByNode.set(n.id, dataIns(n))
    dataOutsByNode.set(n.id, dataOuts(n))
    execOutsByNode.set(n.id, execOuts(n))
  }

  // Edge indices — same as interpreter, but built once at compile time.
  const incoming    = new Map<string, { node: string; pin: string }>()
  const incomingAll = new Map<string, Array<{ node: string; pin: string }>>()
  const execTarget  = new Map<string, string>()
  for (const e of graph.edges) {
    const key = `${e.to.node}:${e.to.pin}`
    if (!incoming.has(key)) incoming.set(key, e.from)
    const bucket = incomingAll.get(key)
    if (bucket) bucket.push(e.from); else incomingAll.set(key, [e.from])
    execTarget.set(`${e.from.node}:${e.from.pin}`, e.to.node)
  }

  // Per-edge data-source pre-resolved to (srcNodeId, dataOutIndex). Resolves "pin id → index"
  // ONCE here so every pull is two map lookups, not three + a findIndex.
  const incomingResolved    = new Map<string, { nodeId: string; outIndex: number }>()
  const incomingAllResolved = new Map<string, Array<{ nodeId: string; outIndex: number }>>()
  for (const [key, src] of incoming) {
    const srcNode = nodeById.get(src.node); if (!srcNode) continue
    const outIndex = dataOutsByNode.get(src.node)!.findIndex((p) => p.id === src.pin)
    if (outIndex >= 0) incomingResolved.set(key, { nodeId: src.node, outIndex })
  }
  for (const [key, srcs] of incomingAll) {
    const resolved: Array<{ nodeId: string; outIndex: number }> = []
    for (const s of srcs) {
      const srcNode = nodeById.get(s.node); if (!srcNode) continue
      const outIndex = dataOutsByNode.get(s.node)!.findIndex((p) => p.id === s.pin)
      if (outIndex >= 0) resolved.push({ nodeId: s.node, outIndex })
    }
    incomingAllResolved.set(key, resolved)
  }

  // Persistent state.
  const vars    = new Map<string, VmValue>()
  const latched = new Map<string, VmValue>()
  let overrides = new Map<string, VmValue>() // recreated per tick
  const afterTickListeners = new Set<() => void>()

  // Forward decl — execRunners populated AFTER ios are built (mutual recursion via flow()).
  const execRunners = new Map<string, () => void>()

  // Build per-node `ExecIO` ONCE. Closures over baked indices — no per-call allocation.
  // For Sequence/Branch this means flow(i) is a single Map lookup + fn call (interp does Map +
  // findIndex over pin array + another Map lookup).
  const ios = new Map<string, ExecIO>()
  for (const node of graph.nodes) {
    const nid = node.id
    const myDataIns  = dataInsByNode.get(nid)!
    const myExecOuts = execOutsByNode.get(nid)!
    const io: ExecIO = {
      node,
      input: (index: number): VmValue | undefined => {
        const pin = myDataIns[index]
        if (!pin) return undefined
        const src = incomingResolved.get(`${nid}:${pin.id}`)
        return src ? pullOut(src.nodeId, src.outIndex) : (pin.default as VmValue | undefined)
      },
      inputAll: (index: number): VmValue[] => {
        const pin = myDataIns[index]
        if (!pin) return []
        const srcs = incomingAllResolved.get(`${nid}:${pin.id}`) ?? []
        const out: VmValue[] = []
        for (const s of srcs) {
          const v = pullOut(s.nodeId, s.outIndex)
          if (v !== undefined) out.push(v)
        }
        return out
      },
      state:   (key: string) => node.state?.[key],
      getVar:  (name: string) => vars.get(name),
      setVar:  (name: string, value: VmValue) => { vars.set(name, value) },
      setOutput: (index: number, value: VmValue) => { overrides.set(`${nid}:${index}`, value) },
      flow: (execOutIndex: number): void => {
        const pin = myExecOuts[execOutIndex]
        if (!pin) return
        const target = execTarget.get(`${nid}:${pin.id}`)
        if (!target) return
        const runner = execRunners.get(target)
        if (runner) runner()
      },
      nodes: () => graph.nodes,
    }
    ios.set(nid, io)
  }

  // Pull a value off a node's data-out: per-tick override → pure eval → cross-tick latched value.
  function pullOut(nodeId: string, outIndex: number): VmValue | undefined {
    const key = `${nodeId}:${outIndex}`
    if (overrides.has(key)) return overrides.get(key)
    const node = nodeById.get(nodeId)
    if (!node) return undefined
    const def = defMap.get(node.type)
    if (def?.evalPure) return def.evalPure(ios.get(nodeId)!)[outIndex]
    // Source nodes without an evaluator expose their `state` on every data-out (Agent/Goodie pattern).
    if (!def && node.state) return node.state as VmValue
    return latched.get(key)
  }

  // Pre-resolve per-node runners (direct fn refs, no Map lookup in the hot path).
  for (const node of graph.nodes) {
    const def = defMap.get(node.type)
    if (def?.run) {
      const run = def.run
      const io = ios.get(node.id)!
      execRunners.set(node.id, () => run(io))
    }
  }

  // Pre-group entry runners by node.type so `tick(entryType)` is a single array walk, no filter.
  const entriesByType = new Map<string, Array<() => void>>()
  for (const node of graph.nodes) {
    const runner = execRunners.get(node.id)
    if (!runner) continue
    const bucket = entriesByType.get(node.type)
    if (bucket) bucket.push(runner); else entriesByType.set(node.type, [runner])
  }

  return {
    tick(entryType = 'Tick'): void {
      overrides = new Map()
      const runners = entriesByType.get(entryType)
      if (runners) for (const r of runners) r()
      for (const [k, v] of overrides) latched.set(k, v)
      for (const cb of afterTickListeners) cb()
    },
    onAfterTick(cb): () => void {
      afterTickListeners.add(cb)
      return () => afterTickListeners.delete(cb)
    },
    getVar: (name) => vars.get(name),
    setVar: (name, value) => { vars.set(name, value) },
    reset(): void {
      vars.clear()
      latched.clear()
      overrides = new Map()
    },
  }
}
