import { describe, it, expect } from 'vitest'
import { fuzzyMatch } from './fuzzy.js'

describe('fuzzyMatch', () => {
  it('empty query matches anything with a neutral score', () => {
    const m = fuzzyMatch('', 'Transform')
    expect(m.matched).toBe(true)
    expect(m.score).toBe(0)
    expect(m.indices).toEqual([])
  })

  it('matches a contiguous prefix', () => {
    const m = fuzzyMatch('tra', 'Transform')
    expect(m.matched).toBe(true)
    expect(m.indices).toEqual([0, 1, 2])
  })

  it('matches a non-contiguous subsequence (tf → TransForm)', () => {
    const m = fuzzyMatch('tf', 'Transform')
    expect(m.matched).toBe(true)
    // T at 0, f at index of 'f' in "Transform" → 'Transform' = T r a n s f o r m → 'f' at 5
    expect(m.indices).toEqual([0, 5])
  })

  it('is case-insensitive', () => {
    expect(fuzzyMatch('TRANS', 'transform').matched).toBe(true)
    expect(fuzzyMatch('trans', 'TRANSFORM').matched).toBe(true)
  })

  it('returns matched:false when chars are not a subsequence', () => {
    const m = fuzzyMatch('xyz', 'Transform')
    expect(m.matched).toBe(false)
    expect(m.score).toBe(0)
  })

  it('respects order — "mr" does not match "Transform" (r before m)', () => {
    // 'm' appears at index 8, 'r' at 1 and 7; after m(8) there is no r → no match
    expect(fuzzyMatch('mr', 'Transform').matched).toBe(false)
  })

  it('scores a prefix match higher than a scattered match', () => {
    const prefix    = fuzzyMatch('tra', 'Transform')
    const scattered = fuzzyMatch('tro', 'Transform') // T..r..o spread out
    expect(prefix.score).toBeGreaterThan(scattered.score)
  })

  it('scores consecutive runs higher than gappy ones for equal length', () => {
    const consecutive = fuzzyMatch('sca', 'Scatter')   // S c a — contiguous
    const gappy       = fuzzyMatch('sct', 'Scatter')   // S c ..t
    expect(consecutive.score).toBeGreaterThan(gappy.score)
  })

  it('rewards start-of-word matches (camelCase / separators)', () => {
    // 'gn' should hit the word starts in "getName" (g at 0, N at 3)
    const m = fuzzyMatch('gn', 'getName')
    expect(m.matched).toBe(true)
    expect(m.indices).toEqual([0, 3])
    // and beat a within-word match of the same chars in a different target
    const within = fuzzyMatch('gn', 'segments') // g..n inside the word
    expect(m.score).toBeGreaterThan(within.score)
  })
})
