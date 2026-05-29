// Maps a headless SimState to a xenolith.v1 graph: goodie types become source nodes in a left
// column, agents become nodes in a right column, and each subscription is an animated, type-coloured
// wire from a goodie's out-pin to the agent's in-pin. The agent's live priority rides in `state` and
// is drawn by a host-registered `priorityBar` custom widget. Pure and deterministic — the render
// layer feeds the result to `editor.loadJSON`.

import type { XenolithGraphV1, XenolithNodeV1, XenolithEdgeV1, WidgetSpec } from '@xenolith/editor'
import type { SimState } from './fairqueue.js'

// Shared by simToGraph (initial nodes) AND the insert-palette schemas (build-fairqueue), so a
// palette-added Agent/Goodie carries exactly the same in-node widgets graphToSim reads.
export const AGENT_WIDGETS: WidgetSpec[] = [
  { id: 'priority', type: 'custom', renderer: 'priorityBar', key: 'priority', label: 'Priority', height: 28 },
  { id: 'salary', type: 'slider', key: 'salary', label: 'Salary', min: 0, max: 1, step: 0.05 },
]
export const GOODIE_WIDGETS: WidgetSpec[] = [
  { id: 'cost', type: 'number', key: 'cost', label: 'Cost', min: 0, step: 0.5 },
  { id: 'rate', type: 'slider', key: 'rate', label: 'Spawn / step', min: 0, max: 1, step: 0.05 },
]

export interface LayoutOptions {
  columnGap: number
  rowGap: number // vertical spacing of the goodie column
  agentRowGap: number // vertical spacing of the (taller, widget-bearing) agent column
  animated: boolean // animate the subscription wires (the host gates this on Run)
}

export const DEFAULT_LAYOUT: LayoutOptions = { columnGap: 360, rowGap: 120, agentRowGap: 170, animated: true }

// Domain category colours, declared in the graph data (core reads `categories` — no theme patch).
export const CATEGORY_COLORS = {
  agent: { color: '#7C5CFF' }, // violet — the people in the queue
  goodie: { color: '#FFB020' }, // amber — the goods
  warehouse: { gradient: { start: '#1FB6A8', end: '#0E5C55' } }, // teal — the overflow sink
  state: { color: '#E5484D' }, // red — the State (the tax); priority paid here just burns
} as const

const GOODIE_PIN = 'goodie' // shared pin type so any goodie-out connects to any agent-in / warehouse-in
const TAX_PIN = 'tax' // shared pin type for agent → Government wires
const WAREHOUSE_ID = 'warehouse'
const WAREHOUSE_IN_PIN = 'warehouse:in'
export const STATE_ID = 'state'
export const STATE_IN_PIN = 'state:in'

const goodieNodeId = (type: string): string => `goodie:${type}`
const goodieOutPin = (type: string): string => `goodie:${type}:out`
const agentInPin = (id: string): string => `${id}:in`
const agentTaxPin = (id: string): string => `${id}:tax`

export function simToGraph(state: SimState, layout: Partial<LayoutOptions> = {}): XenolithGraphV1 {
  const { columnGap, rowGap, agentRowGap, animated } = { ...DEFAULT_LAYOUT, ...layout }
  const goodieTypes = Object.keys(state.goodies)

  const goodieNodes: XenolithNodeV1[] = goodieTypes.map((type, i) => ({
    id: goodieNodeId(type),
    type: 'Goodie',
    position: { x: 0, y: i * rowGap },
    render: { title: type, category: 'goodie' },
    // `gtype` is the goodie's stable model type (graphToSim reads it); keeps display short.
    state: { cost: state.goodies[type]!.cost, rate: state.goodies[type]!.rate, gtype: type },
    pins: [
      { id: goodieOutPin(type), kind: 'data', direction: 'out', type: GOODIE_PIN, multiple: true, label: type },
    ],
    widgets: GOODIE_WIDGETS,
  }))

  const agentNodes: XenolithNodeV1[] = state.agents.map((a, i) => ({
    id: a.id,
    type: 'Agent',
    position: { x: columnGap, y: i * agentRowGap },
    render: { title: a.id, category: 'agent' },
    state: { priority: a.priority, salary: a.salary },
    pins: [
      { id: agentInPin(a.id), kind: 'data', direction: 'in', type: GOODIE_PIN, multiple: true, label: 'in' },
      { id: agentTaxPin(a.id), kind: 'data', direction: 'out', type: TAX_PIN, multiple: false, label: 'tax' },
    ],
    widgets: AGENT_WIDGETS,
  }))

  // Warehouse: a read-only sink showing goodies that found no subscriber. Sits below the goodie
  // column; the host pushes a { type: count } stock object into its `stock` widget each tick.
  const warehouseNode: XenolithNodeV1 = {
    id: WAREHOUSE_ID,
    type: 'Warehouse',
    // Top-centre, above both columns — goodies overflow "up" into it.
    position: { x: columnGap * 0.4, y: -agentRowGap },
    render: { title: 'Warehouse', category: 'warehouse' },
    state: { stock: {} },
    pins: [
      { id: WAREHOUSE_IN_PIN, kind: 'data', direction: 'in', type: GOODIE_PIN, multiple: true, label: 'overflow' },
    ],
    widgets: [
      { id: 'stock', type: 'custom', renderer: 'warehouse', key: 'stock', label: 'Unclaimed', height: Math.max(24, goodieTypes.length * 18) },
    ],
  }

  // State (Government): the tax, dressed up as a node for the lay narrative. Holds ONE value — the
  // tax coefficient α. The "tax" agents pay just burns (priority is a queue position, not money);
  // graphToSim reads α from here. Sits to the right of the agents — they collectively ARE the state.
  const agentCount = state.agents.length
  const stateNode: XenolithNodeV1 = {
    id: STATE_ID,
    type: 'State',
    position: { x: columnGap * 2, y: (Math.max(agentCount, 1) - 1) * agentRowGap * 0.5 },
    render: { title: 'Government', category: 'state' },
    state: { taxAlpha: state.params.taxAlpha },
    pins: [
      { id: STATE_IN_PIN, kind: 'data', direction: 'in', type: TAX_PIN, multiple: true, label: 'tax' },
    ],
    widgets: [
      { id: 'taxAlpha', type: 'slider', key: 'taxAlpha', label: 'Tax α', min: 0, max: 0.6, step: 0.01 },
    ],
  }

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

  // Overflow path: every goodie also wires to the Warehouse (static, not animated) so it's visibly
  // where unclaimed goods go — not a node filling from nowhere. graphToSim ignores edges to the
  // Warehouse (it isn't an Agent), so these never count as subscriptions.
  for (const type of goodieTypes) {
    edges.push({
      id: `${type}->warehouse`,
      from: { node: goodieNodeId(type), pin: goodieOutPin(type) },
      to: { node: WAREHOUSE_ID, pin: WAREHOUSE_IN_PIN },
      opts: { sourceType: type, animated: false },
    })
  }

  // Tax path: every agent wires its "tax" out-pin into the State (decorative — graphToSim ignores
  // these; α is read from the State node's widget, not from edges).
  for (const a of state.agents) {
    edges.push({
      id: `${a.id}->state`,
      from: { node: a.id, pin: agentTaxPin(a.id) },
      to: { node: STATE_ID, pin: STATE_IN_PIN },
      opts: { sourceType: TAX_PIN, animated: false },
    })
  }

  return { version: 'xenolith.v1', categories: CATEGORY_COLORS, nodes: [...goodieNodes, ...agentNodes, warehouseNode, stateNode], edges }
}
