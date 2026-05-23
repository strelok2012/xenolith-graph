import { describe, it, expect } from 'vitest'
import { readPinHandle } from './node-renderer.js'

describe('readPinHandle', () => {
  it('returns null for non-object input', () => {
    expect(readPinHandle(null)).toBe(null)
    expect(readPinHandle(undefined)).toBe(null)
    expect(readPinHandle('pin')).toBe(null)
    expect(readPinHandle(42)).toBe(null)
  })

  it('returns null for objects without the __xenPin marker', () => {
    expect(readPinHandle({})).toBe(null)
    expect(readPinHandle({ pinId: 'p1', direction: 'in' })).toBe(null)
  })

  it('returns the stored handle when present', () => {
    const handle = { nodeId: 'n1', pinId: 'p1', direction: 'out' as const, kind: 'data' as const, type: 'float' }
    expect(readPinHandle({ __xenPin: handle })).toEqual(handle)
  })
})
