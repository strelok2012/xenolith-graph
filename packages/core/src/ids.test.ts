import { describe, it, expect } from 'vitest'
import {
  createNodeId,
  createEdgeId,
  createPinId,
  createCommentId,
  isUuidV7,
} from './ids.js'
import type { NodeId, EdgeId, PinId, CommentId } from './ids.js'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('id factories', () => {
  it('createNodeId returns a string matching the UUID v7 format', () => {
    const id = createNodeId()
    expect(typeof id).toBe('string')
    expect(id).toMatch(UUID_PATTERN)
  })

  it.each([
    ['createNodeId', createNodeId],
    ['createEdgeId', createEdgeId],
    ['createPinId', createPinId],
    ['createCommentId', createCommentId],
  ] as const)('%s yields uuid v7', (_name, fn) => {
    expect(fn()).toMatch(UUID_PATTERN)
  })

  it('successive ids are unique across 1000 calls', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 1000; i++) ids.add(createNodeId())
    expect(ids.size).toBe(1000)
  })

  it('ids generated later sort after ids generated earlier (time-sortable v7)', async () => {
    const a = createNodeId()
    await new Promise((r) => setTimeout(r, 5))
    const b = createNodeId()
    await new Promise((r) => setTimeout(r, 5))
    const c = createNodeId()
    const sorted = [a, b, c].slice().sort()
    expect(sorted).toEqual([a, b, c])
  })

  it('isUuidV7 recognises a freshly generated id', () => {
    expect(isUuidV7(createNodeId())).toBe(true)
  })

  it('isUuidV7 rejects garbage', () => {
    expect(isUuidV7('not-a-uuid')).toBe(false)
    expect(isUuidV7('')).toBe(false)
    // v4 layout (version nibble != 7)
    expect(isUuidV7('00000000-0000-4000-8000-000000000000')).toBe(false)
  })

  it('brand types are erased at runtime (round-trips through JSON unchanged)', () => {
    const id: NodeId = createNodeId()
    const round = JSON.parse(JSON.stringify({ id })) as { id: string }
    expect(round.id).toBe(id)
  })

  it('exports distinct brand types for compile-time safety', () => {
    // Runtime check: factories produce strings; the brand exists only in TS.
    const n: NodeId = createNodeId()
    const e: EdgeId = createEdgeId()
    const p: PinId = createPinId()
    const c: CommentId = createCommentId()
    expect([n, e, p, c].every((x) => typeof x === 'string')).toBe(true)
  })
})
