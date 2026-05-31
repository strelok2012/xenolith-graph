// Public entry: `compile(graph, defs)` → an async-instantiated WASM module that runs the graph.
// Same call surface as the JS codegen so a host can swap engines per-graph.

import type { RtGraph, NodeDef } from '@xenolith/plugin-runtime'
import { emitASSource, varIndexOf, canCompileToAS } from './emit.js'
import { compileAS } from './compile.js'

export { canCompileToAS, emitASSource } from './emit.js'
export { compileAS } from './compile.js'

export interface ASWasmGraph {
  tick(entryType?: string): void
  getVar(name: string): number | undefined
  setVar(name: string, value: number): void
  reset(): void
  /** Present only when the graph declares `meta.inputs`/`meta.outputs`. Pass inputs in order, get
   *  the first declared output back. ~2× faster on hot loops vs set+tick+get (no host trampolines
   *  per var). */
  tickArgs?: (...args: number[]) => number
  /** Raw module bytes — exposed for sanity checks + the bench's "we actually shipped WASM" line. */
  readonly wasm: Uint8Array
  /** Generated AS source — handy when something looks wrong and you want to inspect the emit. */
  readonly source: string
}

export async function compile(graph: RtGraph, defs: ReadonlyArray<NodeDef>): Promise<ASWasmGraph> {
  if (!canCompileToAS(graph)) throw new Error('compile: graph uses non-numeric primitives')
  const source = emitASSource(graph, defs)
  const { wasm } = await compileAS(source)
  const mod = new WebAssembly.Module(wasm as unknown as BufferSource)
  const instance = new WebAssembly.Instance(mod, {
    // AS abort handler — fires on `unreachable` (assertions, OOB). For now just throw.
    env: {
      abort: (_msg: number, _file: number, line: number, col: number) => {
        throw new Error(`AS abort at ${line}:${col}`)
      },
    },
  })
  const exports = instance.exports as Record<string, unknown> & {
    tick: () => void
    init: () => void
    getVar: (idx: number) => number
    setVar: (idx: number, v: number) => void
    varCount: () => number
    tickArgs?: (...args: number[]) => number
  }
  const varIndex = varIndexOf(graph)
  const tickArgsExport = exports.tickArgs

  return {
    wasm, source,
    tick(entryType = 'Tick'): void {
      if (entryType === 'Init') exports.init(); else exports.tick()
    },
    // Forward `tickArgsExport` directly — no `(...args) => fn(...args)` wrapper. Variadic
    // forwarding allocates an args array per call which dominates the 100-iter Mandelbrot cost.
    ...(tickArgsExport ? { tickArgs: tickArgsExport } : {}),
    getVar(name): number | undefined {
      const vi = varIndex.get(name); if (vi === undefined) return undefined
      return exports.getVar(vi)
    },
    setVar(name, value): void {
      let vi = varIndex.get(name)
      if (vi === undefined) { vi = varIndex.size; varIndex.set(name, vi) }
      exports.setVar(vi, value)
    },
    reset(): void {
      const count = exports.varCount()
      for (let i = 0; i < count; i++) exports.setVar(i, 0)
    },
  }
}
