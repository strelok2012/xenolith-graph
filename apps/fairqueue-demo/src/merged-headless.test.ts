import { describe, it, expect } from 'vitest'
import { Runtime, type RtGraph, type RtNode } from '@xenolith/plugin-runtime'
import { fairqueueMergedGraph, MERGED_DEFS } from './runtime-graph.js'
import { createSim } from './fairqueue.js'

// The merged graph in headless form. Strip XenolithGraphV1 chrome to RtGraph and run a few ticks —
// proves the wire-driven Agent/Goodie chain feeds the algorithm without the editor in the loop.
describe('merged graph (headless)', () => {
  it('produces non-zero priorities after a few ticks', () => {
    const { agents, goodies } = (() => {
      const ag = ['Ada', 'Boris', 'Cleo', 'Dmitri', 'Esra', 'Finn']
      const sub: Record<string, string[]> = {
        Ada: ['gift', 'coin'], Boris: ['coin'], Cleo: ['gift', 'star'],
        Dmitri: ['coin', 'star'], Esra: ['gift', 'coin', 'star'], Finn: ['star'],
      }
      const sal: Record<string, number> = { Ada: 0.5, Boris: 0.4, Cleo: 0.6, Dmitri: 0.5, Esra: 0.55, Finn: 0.45 }
      const agents = ag.map((id) => ({ id, priority: 0, salary: sal[id]!, subscriptions: sub[id]! }))
      const goodies = [{ type: 'gift', cost: 2, rate: 0.4 }, { type: 'coin', cost: 1.5, rate: 0.6 }, { type: 'star', cost: 4, rate: 0.2 }]
      void createSim // keep import (typecheck)
      return { agents, goodies }
    })()

    const v1 = fairqueueMergedGraph(agents, goodies)
    // Convert XenolithGraphV1 → RtGraph (strip render/position/widgets/glyph; keep pins minimal).
    const rtNodes: RtNode[] = v1.nodes.map((n) => ({
      id: n.id, type: n.type,
      state: (n.state ?? {}) as Record<string, unknown>,
      pins: n.pins.map((p) => ({ id: p.id, kind: p.kind, direction: p.direction, type: String(p.type) })),
    }))
    const rtEdges = v1.edges.map((e) => ({ from: e.from, to: e.to }))
    const graph: RtGraph = { nodes: rtNodes, edges: rtEdges }

    const rt = new Runtime(MERGED_DEFS)
    for (let i = 0; i < 5; i++) rt.tick(graph)
    const scattered = (rt.getVar('scatter-out:scatter') as number[] | undefined) ?? []
    expect(scattered.length).toBe(agents.length)
    expect(scattered.some((v) => v !== 0)).toBe(true)
  })
})
