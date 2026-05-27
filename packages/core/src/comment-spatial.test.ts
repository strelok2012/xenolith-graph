import { describe, it, expect } from 'vitest'
import { nodesInsideComment } from './comment-spatial.js'
import { createNodeId } from './ids.js'

const frame = { position: { x: 0, y: 0 }, size: { x: 400, y: 300 } }

describe('nodesInsideComment', () => {
  it('includes a node whose centre is inside the frame', () => {
    const id = createNodeId()
    expect(nodesInsideComment(frame, [{ id, position: { x: 100, y: 100 }, size: { x: 80, y: 40 } }])).toEqual([id])
  })

  it('excludes a node whose centre is outside even if it overlaps the edge', () => {
    const id = createNodeId()
    // node spans x 380..460, centre x=420 > 400 → outside
    expect(nodesInsideComment(frame, [{ id, position: { x: 380, y: 100 }, size: { x: 80, y: 40 } }])).toEqual([])
  })

  it('treats a size-less node as a point at its position', () => {
    const inId = createNodeId(), outId = createNodeId()
    const r = nodesInsideComment(frame, [
      { id: inId, position: { x: 200, y: 150 } },
      { id: outId, position: { x: 500, y: 150 } },
    ])
    expect(r).toEqual([inId])
  })

  it('returns only the contained subset from a mix', () => {
    const a = createNodeId(), b = createNodeId()
    const r = nodesInsideComment(frame, [
      { id: a, position: { x: 50, y: 50 }, size: { x: 20, y: 20 } },
      { id: b, position: { x: 900, y: 50 }, size: { x: 20, y: 20 } },
    ])
    expect(r).toEqual([a])
  })
})
