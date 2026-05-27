import { describe, it, expect } from 'vitest'
import type { Edge, Node, Pin } from '@xenolith/core'
import {
  parseXenolithGraph,
  serializeXenolithGraph,
  type SerializeInput,
  type XenolithGraphV1,
} from './serialize.js'

function input(overrides: Partial<SerializeInput> = {}): SerializeInput {
  return {
    nodes:       [],
    edges:       [],
    renderOpts:  new Map(),
    edgeOpts:    new Map(),
    ...overrides,
  }
}

// Test ergonomics — strip ID brands so fixtures stay readable.
function mkEdge(id: string, fromNode: string, fromPin: string, toNode: string, toPin: string): Edge {
  return {
    id:   id as Edge['id'],
    from: { node: fromNode as Edge['from']['node'], pin: fromPin as Edge['from']['pin'] },
    to:   { node: toNode   as Edge['to']['node'],   pin: toPin   as Edge['to']['pin']   },
  }
}

function mkNode(
  id: string,
  type: string,
  position: { x: number; y: number },
  pins: Array<{ id: string; kind: 'exec' | 'data'; direction: 'in' | 'out'; type: string; multiple: boolean; label?: string }>,
  extra: Partial<Pick<Node, 'size' | 'state'>> = {},
): Node {
  const node: Node = {
    id:       id as Node['id'],
    type,
    position,
    state:    extra.state ?? {},
    pins:     pins.map((p) => ({
      id:        p.id as Pin['id'],
      kind:      p.kind,
      direction: p.direction,
      type:      p.type,
      multiple:  p.multiple,
      ...(p.label !== undefined ? { label: p.label } : {}),
    })),
  }
  if (extra.size) node.size = extra.size
  return node
}

describe('comments round-trip', () => {
  it('serializes comments and parses them back identically', () => {
    const out = serializeXenolithGraph(input({
      comments: [{ id: 'c1' as never, position: { x: 10, y: 20 }, size: { x: 300, y: 200 }, text: 'Group', color: '#85C244' }],
    }))
    expect(out.comments).toEqual([{ id: 'c1', position: { x: 10, y: 20 }, size: { x: 300, y: 200 }, text: 'Group', color: '#85C244' }])
    const parsed = parseXenolithGraph(JSON.parse(JSON.stringify(out)))
    expect(parsed.comments).toEqual([{ id: 'c1', position: { x: 10, y: 20 }, size: { x: 300, y: 200 }, text: 'Group', color: '#85C244' }])
  })

  it('omits the comments field when there are none, and parses a graph without it', () => {
    const out = serializeXenolithGraph(input())
    expect(out.comments).toBeUndefined()
    expect(parseXenolithGraph(JSON.parse(JSON.stringify(out))).comments).toEqual([])
  })
})

describe('serializeXenolithGraph', () => {
  it('produces an xenolith.v1 envelope with empty arrays for an empty graph', () => {
    const out = serializeXenolithGraph(input())
    expect(out.version).toBe('xenolith.v1')
    expect(out.nodes).toEqual([])
    expect(out.edges).toEqual([])
  })

  it('serializes a node with every field preserved', () => {
    const out = serializeXenolithGraph(input({
      nodes: [mkNode(
        'n1', 'Source', { x: 100, y: 200 },
        [{ id: 'p1', kind: 'data', direction: 'out', type: 'float', multiple: true, label: 'Output' }],
        { size: { x: 150, y: 70 }, state: { foo: 'bar', count: 3 } },
      )],
      renderOpts: new Map([['n1', { category: 'logic', title: 'Source', collapsed: false }]]),
    }))
    expect(out.nodes).toHaveLength(1)
    const n = out.nodes[0]!
    expect(n.id).toBe('n1')
    expect(n.type).toBe('Source')
    expect(n.position).toEqual({ x: 100, y: 200 })
    expect(n.size).toEqual({ x: 150, y: 70 })
    expect(n.state).toEqual({ foo: 'bar', count: 3 })
    expect(n.pins).toEqual([{
      id: 'p1', kind: 'data', direction: 'out', type: 'float', multiple: true, label: 'Output',
    }])
    expect(n.render).toEqual({ category: 'logic', title: 'Source', collapsed: false })
  })

  it('serializes node widgets and round-trips them', () => {
    const node: Node = {
      id: 'n1' as Node['id'], type: 'Knob', position: { x: 0, y: 0 },
      state: { amount: 5, mode: 'mul' }, pins: [],
      widgets: [
        { id: 'amt', type: 'slider', label: 'Amount', key: 'amount', min: 0, max: 10, step: 0.5 },
        { id: 'mode', type: 'combo', label: 'Mode', key: 'mode', values: ['add', 'mul'] },
        { id: 'go', type: 'button', label: 'Run', action: 'run' },
      ],
    }
    const out = serializeXenolithGraph(input({ nodes: [node] }))
    expect(out.nodes[0]!.widgets).toEqual(node.widgets)

    const parsed = parseXenolithGraph(JSON.parse(JSON.stringify(out)))
    expect(parsed.nodes[0]!.widgets).toEqual(node.widgets)
    expect(parsed.nodes[0]!.state).toEqual({ amount: 5, mode: 'mul' })
  })

  it('omits widgets when the node has none', () => {
    const out = serializeXenolithGraph(input({ nodes: [mkNode('n1', 'A', { x: 0, y: 0 }, [])] }))
    expect(out.nodes[0]!.widgets).toBeUndefined()
  })

  it('omits size when absent on the source node', () => {
    const out = serializeXenolithGraph(input({
      nodes: [mkNode('n1', 'A', { x: 0, y: 0 }, [])],
    }))
    expect(out.nodes[0]!.size).toBeUndefined()
  })

  it('serializes edges with endpoints and opts', () => {
    const out = serializeXenolithGraph(input({
      edges: [mkEdge('e1', 'n1', 'p1', 'n2', 'p2')],
      edgeOpts: new Map([['e1', { sourceType: 'float' }]]),
    }))
    expect(out.edges).toEqual([{
      id:   'e1',
      from: { node: 'n1', pin: 'p1' },
      to:   { node: 'n2', pin: 'p2' },
      opts: { sourceType: 'float' },
    }])
  })

  it('omits edge opts when empty', () => {
    const out = serializeXenolithGraph(input({
      edges: [mkEdge('e1', 'a', 'b', 'c', 'd')],
    }))
    expect(out.edges[0]!.opts).toBeUndefined()
  })

  it('serializes label / markerEnd / animated edge opts', () => {
    const out = serializeXenolithGraph(input({
      edges: [mkEdge('e1', 'n1', 'p1', 'n2', 'p2')],
      edgeOpts: new Map([['e1', { sourceType: 'float', label: 'yes', markerEnd: 'arrow' as const, animated: true }]]),
    }))
    expect(out.edges[0]!.opts).toEqual({ sourceType: 'float', label: 'yes', markerEnd: 'arrow', animated: true })
  })

  it('round-trips label / markerEnd / animated through parse', () => {
    const serialized = serializeXenolithGraph(input({
      edges: [mkEdge('e1', 'n1', 'p1', 'n2', 'p2')],
      edgeOpts: new Map([['e1', { label: 'A→B', markerEnd: 'arrow' as const, animated: true }]]),
    }))
    const parsed = parseXenolithGraph(serialized as unknown)
    expect(parsed.edgeOpts.get('e1')).toEqual({ label: 'A→B', markerEnd: 'arrow', animated: true })
  })

  it('includes viewport when provided', () => {
    const out = serializeXenolithGraph(input({ viewport: { x: 10, y: 20, zoom: 1.5 } }))
    expect(out.viewport).toEqual({ x: 10, y: 20, zoom: 1.5 })
  })
})

describe('parseXenolithGraph', () => {
  it('round-trips a complete graph (serialize → parse → identical JSON)', () => {
    const src: SerializeInput = {
      viewport: { x: 5, y: 5, zoom: 0.9 },
      nodes: [
        mkNode('n1', 'Source', { x: 0,   y: 0 },
          [{ id: 'p1', kind: 'data', direction: 'out', type: 'float', multiple: true, label: 'Out' }],
          { size: { x: 150, y: 70 } }),
        mkNode('n2', 'Sink',   { x: 300, y: 0 },
          [{ id: 'p2', kind: 'data', direction: 'in',  type: 'float', multiple: false }],
          { size: { x: 150, y: 70 }, state: { active: true } }),
      ],
      edges: [mkEdge('e1', 'n1', 'p1', 'n2', 'p2')],
      renderOpts: new Map([
        ['n1', { category: 'logic',   title: 'Source', collapsed: false }],
        ['n2', { category: 'utility', title: 'Sink',   collapsed: true  }],
      ]),
      edgeOpts: new Map([['e1', { sourceType: 'float' }]]),
    }
    const json1 = serializeXenolithGraph(src)
    const parsed = parseXenolithGraph(JSON.parse(JSON.stringify(json1)))
    const reSerialize: SerializeInput = {
      nodes: parsed.nodes,
      edges: parsed.edges,
      renderOpts: parsed.renderOpts,
      edgeOpts: parsed.edgeOpts,
    }
    if (parsed.viewport) reSerialize.viewport = parsed.viewport
    const json2 = serializeXenolithGraph(reSerialize)
    expect(json2).toEqual(json1)
  })

  it('throws on missing version', () => {
    expect(() => parseXenolithGraph({ nodes: [], edges: [] } as unknown)).toThrow(/version/i)
  })

  it('throws on unsupported version', () => {
    expect(() => parseXenolithGraph({ version: 'xenolith.v999', nodes: [], edges: [] })).toThrow(/version/i)
  })

  it('throws when nodes is not an array', () => {
    expect(() =>
      parseXenolithGraph({ version: 'xenolith.v1', nodes: 'oops', edges: [] } as unknown as XenolithGraphV1),
    ).toThrow(/nodes/i)
  })

  it('throws when an edge references no endpoint object', () => {
    expect(() =>
      parseXenolithGraph({
        version: 'xenolith.v1',
        nodes: [],
        edges: [{ id: 'e1' } as never],
      }),
    ).toThrow(/edge/i)
  })
})
