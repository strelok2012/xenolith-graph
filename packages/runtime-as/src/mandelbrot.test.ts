// AS-WASM Mandelbrot equivalence: compile once, set vars per pixel, assert against the reference.

import { describe, it, expect } from 'vitest'
import { BUILTIN_PRIMITIVES, mandelbrotPixelGraph, mandelbrotPixelReference } from '@xenolith/plugin-runtime'
import { compile } from './index.js'

const DEFS = [...BUILTIN_PRIMITIVES]
const MAX_ITER = 100

const PIXELS: Array<{ cx: number; cy: number; label: string }> = [
  { cx:  0.0,  cy:  0.0,  label: 'origin' },
  { cx: -1.0,  cy:  0.0,  label: 'period-2 bulb' },
  { cx:  0.5,  cy:  0.5,  label: 'escape fast' },
  { cx: -0.5,  cy:  0.5,  label: 'border' },
  { cx:  2.0,  cy:  0.0,  label: 'far outside' },
  { cx: -0.75, cy:  0.1,  label: 'near edge' },
  { cx: -0.5,  cy:  0.0,  label: 'cardioid interior' },
  { cx:  0.25, cy:  0.0,  label: 'cardioid cusp' },
  { cx: -1.5,  cy:  0.0,  label: 'tail' },
  { cx: -0.123, cy: 0.745, label: 'mini-set region' },
]

describe('Mandelbrot per-pixel — AS-WASM vs reference', { timeout: 30_000 }, () => {
  it('compiles and renders all PIXELS correctly', async () => {
    const g = mandelbrotPixelGraph()
    const cg = await compile(g, DEFS)
    cg.setVar('max_iter', MAX_ITER)
    for (const p of PIXELS) {
      cg.setVar('cx', p.cx); cg.setVar('cy', p.cy)
      cg.tick()
      const got = cg.getVar('iter')
      const want = mandelbrotPixelReference(p.cx, p.cy, MAX_ITER)
      expect(got, `mismatch at ${p.label} (${p.cx}, ${p.cy})`).toBe(want)
    }
  })
})
