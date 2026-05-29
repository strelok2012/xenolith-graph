import { describe, it, expect } from 'vitest'
import type { Edge, Node, Pin, TemplateDefinition } from '@xenolith/core'
import type { RenderNodeOptions } from '@xenolith/render-pixi'
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

describe('category palette + per-node colour (data-first theming)', () => {
  it('round-trips a graph-level categories palette', () => {
    const categories = {
      agent: { color: '#FF8800' },
      warehouse: { gradient: { start: '#112233', end: '#000000' } },
    }
    const out = serializeXenolithGraph(input({ categories }))
    expect(out.categories).toEqual(categories)
    const parsed = parseXenolithGraph(JSON.parse(JSON.stringify(out)))
    expect(parsed.categories).toEqual(categories)
  })

  it('omits categories when none given; parses a graph without the field', () => {
    expect(serializeXenolithGraph(input()).categories).toBeUndefined()
    expect(parseXenolithGraph(JSON.parse(JSON.stringify(serializeXenolithGraph(input())))).categories).toBeUndefined()
  })

  it('round-trips a per-node render.color override', () => {
    const node = mkNode('n1', 'Agent', { x: 0, y: 0 }, [])
    const out = serializeXenolithGraph(input({ nodes: [node], renderOpts: new Map([['n1', { category: 'agent', color: '#AB12CD' }]]) }))
    expect(out.nodes[0]!.render).toEqual({ category: 'agent', color: '#AB12CD' })
    const parsed = parseXenolithGraph(JSON.parse(JSON.stringify(out)))
    expect(parsed.renderOpts.get('n1')).toEqual({ category: 'agent', color: '#AB12CD' })
  })
})

describe('pure flag + meta passthrough', () => {
  it('round-trips a node pure flag and arbitrary meta', () => {
    const node = mkNode('n1', 'Add', { x: 0, y: 0 }, [])
    node.pure = true
    node.meta = { evalKind: 'pure', defaults: { a: 1 }, nativeImpl: 'add' }
    const out = serializeXenolithGraph(input({ nodes: [node] }))
    expect(out.nodes[0]!.pure).toBe(true)
    expect(out.nodes[0]!.meta).toEqual({ evalKind: 'pure', defaults: { a: 1 }, nativeImpl: 'add' })
    const parsed = parseXenolithGraph(JSON.parse(JSON.stringify(out)))
    expect(parsed.nodes[0]!.pure).toBe(true)
    expect(parsed.nodes[0]!.meta).toEqual({ evalKind: 'pure', defaults: { a: 1 }, nativeImpl: 'add' })
  })

  it('omits pure/meta when absent; a graph without them parses unchanged', () => {
    const out = serializeXenolithGraph(input({ nodes: [mkNode('n1', 'A', { x: 0, y: 0 }, [])] }))
    expect(out.nodes[0]!.pure).toBeUndefined()
    expect(out.nodes[0]!.meta).toBeUndefined()
    const parsed = parseXenolithGraph(JSON.parse(JSON.stringify(out)))
    expect(parsed.nodes[0]!.pure).toBeUndefined()
    expect(parsed.nodes[0]!.meta).toBeUndefined()
  })

  it('round-trips a node header glyph', () => {
    const node = mkNode('n1', 'Cpu', { x: 0, y: 0 }, [])
    node.glyph = { icon: 'cpu', side: 'right' }
    const out = serializeXenolithGraph(input({ nodes: [node] }))
    expect(out.nodes[0]!.glyph).toEqual({ icon: 'cpu', side: 'right' })
    const parsed = parseXenolithGraph(JSON.parse(JSON.stringify(out)))
    expect(parsed.nodes[0]!.glyph).toEqual({ icon: 'cpu', side: 'right' })
  })

  it('omits glyph when absent', () => {
    const out = serializeXenolithGraph(input({ nodes: [mkNode('n1', 'A', { x: 0, y: 0 }, [])] }))
    expect(out.nodes[0]!.glyph).toBeUndefined()
    expect(parseXenolithGraph(JSON.parse(JSON.stringify(out))).nodes[0]!.glyph).toBeUndefined()
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

describe('templates round-trip (live-template definitions)', () => {
  function tmplDef(): TemplateDefinition {
    return {
      id: 'def1' as TemplateDefinition['id'],
      title: 'My Template',
      nodes: [
        mkNode('A', 'Mid', { x: 0, y: 0 }, [
          { id: 'a_in', kind: 'data', direction: 'in', type: 'float', multiple: false },
          { id: 'a_out', kind: 'data', direction: 'out', type: 'float', multiple: true },
        ]),
        mkNode('ti', '$templateInput', { x: -200, y: 0 }, [
          { id: 'ti_out', kind: 'data', direction: 'out', type: 'float', multiple: true },
        ]),
        mkNode('to', '$templateOutput', { x: 200, y: 0 }, [
          { id: 'to_in', kind: 'data', direction: 'in', type: 'float', multiple: false },
        ]),
      ],
      edges: [
        mkEdge('w1', 'ti', 'ti_out', 'A', 'a_in'),
        mkEdge('w2', 'A', 'a_out', 'to', 'to_in'),
      ],
    }
  }

  it('serializes templates keyed by definition id and parses them back', () => {
    const out = serializeXenolithGraph(input({ templates: [tmplDef()] }))
    expect(out.templates).toBeTruthy()
    expect(Object.keys(out.templates!)).toEqual(['def1'])
    expect(out.templates!['def1']!.title).toBe('My Template')
    expect(out.templates!['def1']!.nodes.map((n) => n.id).sort()).toEqual(['A', 'ti', 'to'])

    const parsed = parseXenolithGraph(JSON.parse(JSON.stringify(out)))
    expect(parsed.templates).toBeTruthy()
    expect(parsed.templates!).toHaveLength(1)
    expect(parsed.templates![0]!.id).toBe('def1')
    expect(parsed.templates![0]!.title).toBe('My Template')
    expect(parsed.templates![0]!.nodes.map((n) => n.id).sort()).toEqual(['A', 'ti', 'to'])
    expect(parsed.templates![0]!.edges.map((e) => e.id).sort()).toEqual(['w1', 'w2'])
  })

  it('omits templates when there are none, and parses a graph without the field', () => {
    const out = serializeXenolithGraph(input())
    expect(out.templates).toBeUndefined()
    expect(parseXenolithGraph(JSON.parse(JSON.stringify(out))).templates).toBeUndefined()
  })

  it('carries template node render opts through the shared renderOpts map', () => {
    const renderOpts = new Map<string, RenderNodeOptions>([['A', { category: 'logic', title: 'Add' }]])
    const out = serializeXenolithGraph(input({ templates: [tmplDef()], renderOpts }))
    const aNode = out.templates!['def1']!.nodes.find((n) => n.id === 'A')!
    expect(aNode.render).toEqual({ category: 'logic', title: 'Add' })

    const parsed = parseXenolithGraph(JSON.parse(JSON.stringify(out)))
    expect(parsed.renderOpts.get('A')).toEqual({ category: 'logic', title: 'Add' })
  })

  it('round-trips a $templateInstance node referencing a definition', () => {
    const instance = mkNode('inst', '$templateInstance', { x: 50, y: 50 }, [
      { id: 'ip0', kind: 'data', direction: 'in', type: 'float', multiple: false },
      { id: 'ip1', kind: 'data', direction: 'out', type: 'float', multiple: true },
    ], { state: { definitionId: 'def1', pinBoundary: { ip0: 'ti', ip1: 'to' } } })
    const out = serializeXenolithGraph(input({ nodes: [instance], templates: [tmplDef()] }))
    const parsed = parseXenolithGraph(JSON.parse(JSON.stringify(out)))
    const back = parsed.nodes.find((n) => n.id === 'inst')!
    expect(back.type).toBe('$templateInstance')
    expect(back.state['definitionId']).toBe('def1')
    expect(back.pins).toHaveLength(2)
  })
})
