import { describe, it, expect } from 'vitest'
import type { Edge, NodeId, EdgeId, PinId } from '@xenolith/core'
import { computeRerouteBridges } from './reroute-bridge.js'

const n = (s: string): NodeId => s as unknown as NodeId
const p = (s: string): PinId => s as unknown as PinId
const e = (id: string, fromNode: string, fromPin: string, toNode: string, toPin: string): Edge => ({
  id: id as unknown as EdgeId,
  from: { node: n(fromNode), pin: p(fromPin) },
  to:   { node: n(toNode),   pin: p(toPin) },
})

describe('computeRerouteBridges', () => {
  // src --(s:o → R:i)--> Reroute --(R:o → dst:i)--> dst
  it('bridges the upstream source straight to the downstream target', () => {
    const edges = [
      e('e1', 'src', 's:o', 'R', 'R:i'),
      e('e2', 'R', 'R:o', 'dst', 'dst:i'),
    ]
    const bridges = computeRerouteBridges(edges, n('R'), new Set([n('R')]))
    expect(bridges).toEqual([
      { from: { node: n('src'), pin: p('s:o') }, to: { node: n('dst'), pin: p('dst:i') } },
    ])
  })

  it('fans out one input to every downstream target', () => {
    const edges = [
      e('e1', 'src', 's:o', 'R', 'R:i'),
      e('e2', 'R', 'R:o', 'a', 'a:i'),
      e('e3', 'R', 'R:o', 'b', 'b:i'),
    ]
    const bridges = computeRerouteBridges(edges, n('R'), new Set([n('R')]))
    expect(bridges).toHaveLength(2)
    expect(bridges.map((b) => b.to.node)).toEqual([n('a'), n('b')])
    expect(bridges.every((b) => b.from.node === n('src'))).toBe(true)
  })

  it('produces no bridges for a reroute with no upstream feed', () => {
    const edges = [e('e2', 'R', 'R:o', 'dst', 'dst:i')]
    expect(computeRerouteBridges(edges, n('R'), new Set([n('R')]))).toEqual([])
  })

  it('skips bridges whose endpoint is itself being removed', () => {
    const edges = [
      e('e1', 'src', 's:o', 'R', 'R:i'),
      e('e2', 'R', 'R:o', 'dst', 'dst:i'),
    ]
    // dst is also slated for removal → no point reconnecting to it
    expect(computeRerouteBridges(edges, n('R'), new Set([n('R'), n('dst')]))).toEqual([])
  })
})
