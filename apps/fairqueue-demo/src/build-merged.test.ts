import { describe, it, expect } from 'vitest'
import { isAgentStruct, isGoodieStruct } from './build-merged.js'
import { fairqueueMergedGraph } from './runtime-graph.js'

// Regression: discriminators MUST work against the same shape `editor.graph.nodes()` exposes —
// the parsed Node has `state` and `type`, but render.category lives in a separate editor map and
// is INVISIBLE here. The previous version relied on `render.category`, so the host saw zero
// agents/goodies and the live simulation reported mean priority = 0.

const agents = [
  { id: 'Ada',   priority: 0, salary: 0.5,  subscriptions: ['gift', 'coin'] },
  { id: 'Boris', priority: 0, salary: 0.4,  subscriptions: ['coin'] },
]
const goodies = [
  { type: 'gift', cost: 2,   rate: 0.4 },
  { type: 'coin', cost: 1.5, rate: 0.6 },
]

describe('fairqueueMergedGraph + host discriminators', () => {
  const graph = fairqueueMergedGraph(agents, goodies)

  it('every node `state.kind === "agent"` matches `isAgentStruct`', () => {
    const matched = graph.nodes.filter((n) => isAgentStruct({ type: n.type, state: (n.state ?? {}) as Record<string, unknown> }))
    expect(matched.map((n) => n.id).sort()).toEqual(['Ada', 'Boris'])
  })

  it('every node `state.kind === "goodie"` matches `isGoodieStruct`', () => {
    const matched = graph.nodes.filter((n) => isGoodieStruct({ type: n.type, state: (n.state ?? {}) as Record<string, unknown> }))
    expect(matched.map((n) => n.id).sort()).toEqual(['goodie:coin', 'goodie:gift'])
  })

  it('agent state holds per-field values at top level (plugin pulls them as defaults for synthesized widgets)', () => {
    const ada = graph.nodes.find((n) => n.id === 'Ada')!
    expect(ada.state).toMatchObject({ kind: 'agent', name: 'Ada', priority: 0, salary: 0.5, subs: ['gift', 'coin'] })
  })

  it('goodie state holds type/cost/rate at top level the algorithm uses', () => {
    const gift = graph.nodes.find((n) => n.id === 'goodie:gift')!
    expect(gift.state).toMatchObject({ kind: 'goodie', type: 'gift', cost: 2, rate: 0.4 })
  })

  it('agent has only base pins at V1-build time (schema + self); field/extra pins come from the plugin sync', () => {
    const ada = graph.nodes.find((n) => n.id === 'Ada')!
    // `subscribe` is now part of the agent Schema's extraPins — the plugin synthesizes it on edge:connected.
    expect(ada.pins.map((p) => p.label).sort()).toEqual(['schema', 'self'])
    expect(ada.widgets).toBeUndefined() // plugin's setNodeWidgets will install them
  })

  it('the agent Schema declares `subscribe` as an extraPin (multi goodie-rec) so the plugin synthesizes it on every wired Struct', () => {
    const sch = graph.nodes.find((n) => n.id === 'schema:agent')!
    const extras = sch.state!['extraPins'] as Array<{ label: string; direction: string; type: string; multiple?: boolean }>
    const subscribe = extras.find((e) => e.label === 'subscribe')!
    expect(subscribe).toEqual({ label: 'subscribe', direction: 'in', type: 'goodie-rec', multiple: true })
  })

  it('a Schema node per role is included with its fields object in state', () => {
    const sch = graph.nodes.find((n) => n.id === 'schema:agent')!
    expect(sch.type).toBe('Schema')
    expect(Object.keys((sch.state!['fields'] as Record<string, unknown>))).toEqual(['name', 'priority', 'salary', 'subs'])
  })

  it('every Schema node ships the `struct` custom widget so the user can edit fields in-node', () => {
    // Regression: widgets are NOT inherited from the registered Schema schema on loadJSON —
    // a Schema without an explicit `widgets` array renders as a chrome-only pill with nothing to
    // click. EVERY Schema node MUST carry a `widgets` entry pointing at the `struct` renderer.
    for (const sch of graph.nodes.filter((n) => n.type === 'Schema')) {
      const ws = sch.widgets ?? []
      expect(ws).toHaveLength(1)
      const w = ws[0]!
      expect(w.type).toBe('custom')
      expect((w as { renderer?: string }).renderer).toBe('struct')
      expect(w.key).toBe('fields')
    }
  })

  it('Schema OUT pin label MUST match widget.key so the editor binds the widget to it (else the widget gets no layout height)', () => {
    // Regression: core's layout reserves height only for pin-bound widgets — a non-bound custom
    // widget gets `height: 0` and renders invisibly even when `widgets[]` is set. The implicit
    // pinKey-binding looks for a pin whose label equals widget.key.
    for (const sch of graph.nodes.filter((n) => n.type === 'Schema')) {
      const widgetKey = sch.widgets![0]!.key
      expect(sch.pins.some((p) => p.label === widgetKey)).toBe(true)
    }
  })

  it('each per-instance Struct is wired to its role Schema (schema:agent → Ada.schema, etc.)', () => {
    const wire = graph.edges.find((edge) => edge.from.node === 'schema:agent' && edge.to.node === 'Ada')
    expect(wire?.to.pin).toBe('Ada:schema')
  })

  it('discriminators reject non-agent/non-goodie Struct nodes (e.g. a stray user Struct)', () => {
    const stray = { type: 'Struct', state: { data: { x: 1 } } } // no `kind` marker
    expect(isAgentStruct(stray)).toBe(false)
    expect(isGoodieStruct(stray)).toBe(false)
  })

  it('discriminators reject non-Struct types even when state.kind matches', () => {
    expect(isAgentStruct({ type: 'Other', state: { kind: 'agent' } })).toBe(false)
  })
})
