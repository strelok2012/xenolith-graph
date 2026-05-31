// Engine wrappers — each exposes the same `(cx, cy, maxIter) → iter` per-pixel surface so the
// canvas renderer doesn't care which one is driving it. The graph fed in is the SAME RtGraph that
// drives the editor (via graphSnapshot), so "what you see in the editor IS what runs".

import { Runtime, BUILTIN_PRIMITIVES, codegen, mandelbrotPixelReference, type RtGraph, type NodeDef } from '@xenolith/plugin-runtime'
import { compile as compileAsWasm } from '@xenolith/runtime-as'

export type EngineId = 'reference' | 'interp' | 'codegen-js' | 'as-wasm-vars' | 'as-wasm-args'

export interface Engine {
  id: EngineId
  label: string
  /** Renders one pixel: returns iter count. */
  pixel: (cx: number, cy: number, maxIter: number) => number
}

const DEFS: ReadonlyArray<NodeDef> = [...BUILTIN_PRIMITIVES]

export interface EngineBundle {
  engines: Engine[]
  /** Generated AssemblyScript source for the graph — shown verbatim in the demo UI. */
  asSource: string
  /** Size of the compiled WASM module in bytes — for the demo's "shipped X kB of WASM" line. */
  wasmBytes: number
  /** Declared graph input names (from GraphInput nodes), in tickArgs parameter order. */
  inputs: string[]
  /** Declared graph output names (from GraphOutput nodes). First = tickArgs return value. */
  outputs: string[]
  /** Run the AS-WASM module once with the given input map; returns { ms, outputs }.
   *  Used by the interactive Inputs panel to prove "this is a real function I can call". */
  runOnce: (values: Record<string, number>) => { outputs: Record<string, number>; ms: number }
}

export async function buildEngines(graph: RtGraph): Promise<EngineBundle> {
  // Reference — plain JS, no graph at all. The honest baseline.
  const reference: Engine = {
    id: 'reference',
    label: 'Reference JS (hand-written)',
    pixel: (cx, cy, maxIter) => mandelbrotPixelReference(cx, cy, maxIter),
  }

  // Interpreter — Runtime walking the RtGraph node-by-node, no codegen at all.
  const rt = new Runtime(DEFS)
  const interp: Engine = {
    id: 'interp',
    label: 'Interpreter (walks the graph)',
    pixel: (cx, cy, maxIter) => {
      rt.setVar('cx', cx); rt.setVar('cy', cy); rt.setVar('max_iter', maxIter)
      rt.tick(graph)
      return (rt.getVar('iter') as number) | 0
    },
  }

  // JS codegen — `new Function`-compiled graph.
  const cg = codegen(graph, DEFS)
  const cjs: Engine = {
    id: 'codegen-js',
    label: 'JS codegen (new Function)',
    pixel: (cx, cy, maxIter) => {
      cg.setVar('cx', cx); cg.setVar('cy', cy); cg.setVar('max_iter', maxIter)
      cg.tick()
      return (cg.getVar('iter') as number) | 0
    },
  }

  // AS-WASM — set/get vars per tick (current API).
  const ag = await compileAsWasm(graph, DEFS)
  const wasmVars: Engine = {
    id: 'as-wasm-vars',
    label: 'AS-WASM (set/get vars)',
    pixel: (cx, cy, maxIter) => {
      ag.setVar('cx', cx); ag.setVar('cy', cy); ag.setVar('max_iter', maxIter)
      ag.tick()
      return (ag.getVar('iter') as number) | 0
    },
  }

  // AS-WASM — tickArgs(...): one host↔WASM crossing per pixel, inputs in WASM regs.
  const tickArgs = ag.tickArgs
  const wasmArgs: Engine = {
    id: 'as-wasm-args',
    label: 'AS-WASM (tickArgs — inputs as params)',
    pixel: tickArgs
      ? (cx, cy, maxIter) => tickArgs(cx, cy, maxIter) | 0
      : (cx, cy, maxIter) => { ag.setVar('cx', cx); ag.setVar('cy', cy); ag.setVar('max_iter', maxIter); ag.tick(); return (ag.getVar('iter') as number) | 0 },
  }

  // Auto-derive declared I/O names by scanning the graph (same logic the AS-WASM emitter uses).
  const inputs  = graph.nodes
    .filter((n) => n.type === 'GraphInput'  && typeof n.state?.['name'] === 'string')
    .map((n) => n.state!['name'] as string)
  const outputs = graph.nodes
    .filter((n) => n.type === 'GraphOutput' && typeof n.state?.['name'] === 'string')
    .map((n) => n.state!['name'] as string)

  const runOnce = (values: Record<string, number>): { outputs: Record<string, number>; ms: number } => {
    const args = inputs.map((n) => Number(values[n] ?? 0))
    const t0 = performance.now()
    const first = ag.tickArgs ? ag.tickArgs(...args) : (() => {
      for (let i = 0; i < inputs.length; i++) ag.setVar(inputs[i]!, args[i]!)
      ag.tick(); return ag.getVar(outputs[0] ?? '') ?? 0
    })()
    const ms = performance.now() - t0
    const out: Record<string, number> = {}
    outputs.forEach((name, i) => { out[name] = i === 0 ? first : (ag.getVar(name) ?? 0) })
    return { outputs: out, ms }
  }

  return {
    engines: [wasmArgs, wasmVars, cjs, interp, reference],
    asSource: ag.source,
    wasmBytes: ag.wasm.byteLength,
    inputs, outputs, runOnce,
  }
}
