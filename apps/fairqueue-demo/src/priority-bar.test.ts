import { describe, it, expect } from 'vitest'
import { signedFraction, pointerToValue, SCALE } from './priority-bar.js'

describe('signedFraction', () => {
  it('puts the 0 reference at the centre (fraction 0)', () => {
    expect(signedFraction(0)).toBe(0)
  })
  it('maps positive right and negative left, symmetric', () => {
    expect(signedFraction(SCALE / 2)).toBeCloseTo(0.5)
    expect(signedFraction(-SCALE / 2)).toBeCloseTo(-0.5)
  })
  it('clamps beyond ±scale and floors NaN at 0', () => {
    expect(signedFraction(SCALE * 5)).toBe(1)
    expect(signedFraction(-SCALE * 5)).toBe(-1)
    expect(signedFraction(NaN)).toBe(0)
  })
})

describe('pointerToValue', () => {
  it('maps the bar centre to 0 and edges to ±scale (inverse of signedFraction)', () => {
    const width = 120
    expect(pointerToValue(width / 2, width)).toBeCloseTo(0)
    expect(pointerToValue(width, width)).toBeCloseTo(SCALE)
    expect(pointerToValue(0, width)).toBeCloseTo(-SCALE)
  })
  it('clamps out-of-bounds x into [-scale, scale]', () => {
    expect(pointerToValue(-50, 120)).toBe(-SCALE)
    expect(pointerToValue(500, 120)).toBe(SCALE)
  })
})
