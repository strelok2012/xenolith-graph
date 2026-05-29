import { describe, it, expect } from 'vitest'
import { stockEntries } from './warehouse-widget.js'

describe('stockEntries', () => {
  it('turns a { type: count } object into rows sorted by count desc', () => {
    expect(stockEntries({ gift: 1, star: 5, coin: 0 })).toEqual([
      { type: 'star', count: 5 },
      { type: 'gift', count: 1 },
      { type: 'coin', count: 0 },
    ])
  })
  it('returns [] for non-object / null values', () => {
    expect(stockEntries(undefined)).toEqual([])
    expect(stockEntries(null)).toEqual([])
    expect(stockEntries(42)).toEqual([])
  })
})
