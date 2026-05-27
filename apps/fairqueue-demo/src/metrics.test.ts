import { describe, it, expect } from 'vitest'
import { geometricMean, gini } from './metrics.js'

describe('geometricMean', () => {
  it('is the exp of the mean of logs', () => {
    expect(geometricMean([2, 8])).toBeCloseTo(4) // sqrt(16)
  })
  it('defaults to 1 for an empty set', () => {
    expect(geometricMean([])).toBe(1)
  })
})

describe('gini', () => {
  it('is 0 for a perfectly equal distribution', () => {
    expect(gini([5, 5, 5, 5])).toBeCloseTo(0)
  })
  it('is 0 for all-zero or empty input', () => {
    expect(gini([0, 0, 0])).toBe(0)
    expect(gini([])).toBe(0)
  })
  it('rises toward 1 as one holder takes everything', () => {
    expect(gini([0, 0, 0, 100])).toBeGreaterThan(0.7)
  })
  it('orders a moderately unequal split between the extremes', () => {
    const g = gini([1, 2, 3, 4])
    expect(g).toBeGreaterThan(0)
    expect(g).toBeLessThan(0.7)
  })
})
