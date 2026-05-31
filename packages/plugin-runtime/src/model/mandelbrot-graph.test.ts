// Equivalence: graph-interpreted Mandelbrot vs reference implementation, then JS-codegen vs same.

import { describe, it, expect } from 'vitest'
import { Runtime } from '../vm/interpreter.js'
import { BUILTIN_PRIMITIVES } from '../vm/primitives.js'
import { codegen } from '../vm/codegen.js'
import { mandelbrotPixelGraph, mandelbrotPixelReference } from './mandelbrot-graph.js'

const DEFS = [...BUILTIN_PRIMITIVES]

/** A scatter of test pixels — picks corners, axis points, and the cardioid + period-2 bulb interior
 *  (which iterate to MAX) plus exterior points that escape early. Covers every code path. */
const PIXELS: Array<{ cx: number; cy: number; label: string }> = [
  { cx:  0.0,  cy:  0.0,  label: 'origin (inside)' },
  { cx: -1.0,  cy:  0.0,  label: 'period-2 bulb' },
  { cx:  0.5,  cy:  0.5,  label: 'outside, escapes fast' },
  { cx: -0.5,  cy:  0.5,  label: 'border' },
  { cx:  2.0,  cy:  0.0,  label: 'far outside (escapes immediately)' },
  { cx: -0.75, cy:  0.1,  label: 'near edge' },
  { cx: -0.5,  cy:  0.0,  label: 'main cardioid interior' },
  { cx:  0.25, cy:  0.0,  label: 'main cardioid cusp' },
  { cx: -1.5,  cy:  0.0,  label: 'tail of needle' },
  { cx: -0.123, cy: 0.745, label: 'mini-Mandelbrot region' },
]
const MAX_ITER = 100

describe('Mandelbrot per-pixel — graph vs reference', () => {
  const g = mandelbrotPixelGraph()
  const rt = new Runtime(DEFS)
  rt.setVar('max_iter', MAX_ITER)
  for (const p of PIXELS) {
    it(`interp matches reference for ${p.label} (${p.cx}, ${p.cy})`, () => {
      rt.setVar('cx', p.cx); rt.setVar('cy', p.cy)
      rt.tick(g)
      const got = rt.getVar('iter')
      const want = mandelbrotPixelReference(p.cx, p.cy, MAX_ITER)
      expect(got).toBe(want)
    })
  }
})

describe('Mandelbrot per-pixel — codegen-js vs reference', () => {
  const g = mandelbrotPixelGraph()
  const cg = codegen(g, DEFS)
  cg.setVar('max_iter', MAX_ITER)
  for (const p of PIXELS) {
    it(`codegen-js matches reference for ${p.label} (${p.cx}, ${p.cy})`, () => {
      cg.setVar('cx', p.cx); cg.setVar('cy', p.cy)
      cg.tick()
      const got = cg.getVar('iter')
      const want = mandelbrotPixelReference(p.cx, p.cy, MAX_ITER)
      expect(got).toBe(want)
    })
  }
})
