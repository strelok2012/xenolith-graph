// Mandelbrot per-pixel throughput — the headline numbers. Each engine renders the same pixel
// (a point inside the set so all 100 iterations actually execute), repeated. ops/s = pixels/s.

import { bench, describe } from 'vitest'
import { Runtime, BUILTIN_PRIMITIVES, mandelbrotPixelGraph, mandelbrotPixelReference } from '@xenolith/plugin-runtime'
import { codegen } from '../../plugin-runtime/src/vm/codegen.js'
import { compile } from './index.js'

const DEFS = [...BUILTIN_PRIMITIVES]
const MAX_ITER = 100
// Origin is INSIDE the set → runs the full MAX_ITER per call. Worst case for the engine,
// fairest comparison (no early-exit shortcuts).
const CX = 0.0, CY = 0.0

const G = mandelbrotPixelGraph()
const rt = new Runtime(DEFS)
const cg = codegen(G, DEFS)
const ag = await compile(G, DEFS)

// Seed inputs once. The bench calls tick() repeatedly without re-setting vars (zx/zy/iter are
// re-zeroed each tick by the graph's init phase, so the result is deterministic).
for (const e of [rt, cg, ag]) {
  e.setVar('cx', CX); e.setVar('cy', CY); e.setVar('max_iter', MAX_ITER)
}

const tickArgs = ag.tickArgs!  // mandelbrot graph declares meta.inputs/outputs so it's defined

// Pre-computed unrolled pixel coords inside the period-2 bulb (so all MAX_ITER iters run, no
// early-escape shortcut). Using Math.random()-ish jitter prevents V8 from constant-folding the
// reference call site — otherwise the inlined `mandelbrotPixelReference(0, 0, 100)` becomes a
// no-op return after JIT and the comparison is meaningless.
const COORDS = Array.from({ length: 256 }, (_, i) => {
  const t = (i / 256) * 0.001
  return { cx: -1.0 + t, cy: t * 0.5 }
})
let _idx = 0
const nextPixel = (): { cx: number; cy: number } => { const p = COORDS[_idx++ & 255]!; return p }
// Sink to defeat dead-store elimination on the reference branch.
let _sink = 0

describe(`Mandelbrot per-pixel (period-2 bulb, ${MAX_ITER} iters) — pixels/sec`, () => {
  bench('reference (plain JS, no graph)',  () => { const p = nextPixel(); _sink += mandelbrotPixelReference(p.cx, p.cy, MAX_ITER) })
  bench('interp',                          () => { const p = nextPixel(); rt.setVar('cx', p.cx); rt.setVar('cy', p.cy); rt.tick(G); _sink += rt.getVar('iter') as number })
  bench('codegen-js',                      () => { const p = nextPixel(); cg.setVar('cx', p.cx); cg.setVar('cy', p.cy); cg.tick(); _sink += cg.getVar('iter') as number })
  bench('codegen-as-wasm (tick + vars)',   () => { const p = nextPixel(); ag.setVar('cx', p.cx); ag.setVar('cy', p.cy); ag.tick(); _sink += ag.getVar('iter') as number })
  bench('codegen-as-wasm (tickArgs)',      () => { const p = nextPixel(); _sink += tickArgs(p.cx, p.cy, MAX_ITER) })
})
