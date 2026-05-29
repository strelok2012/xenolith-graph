import { describe, it, expect } from 'vitest'
import { gifFrameCount } from './gif-export.js'

describe('gifFrameCount', () => {
  it('multiplies seconds by fps, rounded', () => {
    expect(gifFrameCount(5, 10)).toBe(50)
    expect(gifFrameCount(3, 12)).toBe(36)
    expect(gifFrameCount(2.5, 10)).toBe(25)
  })
  it('always captures at least one frame', () => {
    expect(gifFrameCount(0, 10)).toBe(1)
  })
})
