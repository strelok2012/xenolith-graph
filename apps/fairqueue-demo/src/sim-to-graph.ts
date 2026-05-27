// Maps a headless SimState to a xenolith.v1 graph: goodie types become source nodes in a left
// column, agents become nodes in a right column, and each subscription is an animated, type-coloured
// wire from a goodie's out-pin to the agent's in-pin. The agent's live priority rides in `state` and
// is drawn by a host-registered `priorityBar` custom widget. Pure and deterministic — the render
// layer feeds the result to `editor.loadJSON`.

import type { XenolithGraphV1, XenolithNodeV1, XenolithEdgeV1 } from '@xenolith/editor'
import type { SimState } from './fairqueue.js'

export interface LayoutOptions {
  columnGap: number
  rowGap: number // vertical spacing of the goodie column
  agentRowGap: number // vertical spacing of the (taller, widget-bearing) agent column
  animated: boolean // animate the subscription wires (the host gates this on Run)
}

export const DEFAULT_LAYOUT: LayoutOptions = { columnGap: 360, rowGap: 120, agentRowGap: 170, animated: true }

const GOODIE_PIN = 'goodie'

const goodieNodeId = (type: string): string => `goodie:${type}`
const goodieOutPin = (type: string): string => `goodie:${type}:out`
const agentInPin = (id: string): string => `${id}:in`

export function simToGraph(state: SimState, layout: Partial<LayoutOptions> = {}): XenolithGraphV1 {
  const { columnGap, rowGap, agentRowGap, animated } = { ...DEFAULT_LAYOUT, ...layout }
  const goodieTypes = Object.keys(state.goodies)

  const goodieNodes: XenolithNodeV1[] = goodieTypes.map((type, i) => ({
    id: goodieNodeId(type),
    type: 'Goodie',
    position: { x: 0, y: i * rowGap },
    render: { title: type, category: 'goodie' },
    pins: [
      { id: goodieOutPin(type), kind: 'data', direction: 'out', type, multiple: true, label: type },
    ],
  }))

  const agentNodes: XenolithNodeV1[] = state.agents.map((a, i) => ({
    id: a.id,
    type: 'Agent',
    position: { x: columnGap, y: i * agentRowGap },
    render: { title: a.id, category: 'agent' },
    state: { priority: a.priority },
    pins: [
      { id: agentInPin(a.id), kind: 'data', direction: 'in', type: GOODIE_PIN, multiple: true, label: 'in' },
    ],
    widgets: [
      { id: 'priority', type: 'custom', renderer: 'priorityBar', key: 'priority', label: 'Priority', height: 28 },
    ],
  }))

  const edges: XenolithEdgeV1[] = []
  for (const a of state.agents) {
    for (const type of a.subscriptions) {
      if (!state.goodies[type]) continue
      edges.push({
        id: `${type}->${a.id}`,
        from: { node: goodieNodeId(type), pin: goodieOutPin(type) },
        to: { node: a.id, pin: agentInPin(a.id) },
        opts: { sourceType: type, animated },
      })
    }
  }

  return { version: 'xenolith.v1', nodes: [...goodieNodes, ...agentNodes], edges }
}
