import { describe, it, expect } from 'vitest'
import { buildHandlers, McpClient, type McpEditorSurface, type McpSocketLike } from './mcp.js'

function pin(id: string, dir: 'in' | 'out', label: string, type = 'float'): { id: string; kind: 'data'; direction: 'in' | 'out'; type: string; label: string } {
  return { id, kind: 'data', direction: dir, type, label }
}
function makeMockEditor(seed: { nodes?: Array<{ id: string; type?: string; x: number; y: number; w?: number; h?: number; pins?: Array<{ id: string; dir: 'in' | 'out'; label: string; type?: string }> }>; edges?: Array<{ from: string; to: string }> } = {}): McpEditorSurface & { _calls: string[]; _nodes: Map<string, { id: string; type: string; position: { x: number; y: number }; size: { x: number; y: number }; pins: ReturnType<typeof pin>[] }>; _edges: Array<{ from: { node: string; pin: string }; to: { node: string; pin: string } }> } {
  const calls: string[] = []
  const nodes = new Map(
    (seed.nodes ?? []).map((n) => [n.id, {
      id: n.id,
      type: n.type ?? 'Box',
      position: { x: n.x, y: n.y },
      size: { x: n.w ?? 200, y: n.h ?? 100 },
      pins: (n.pins ?? []).map((p) => pin(p.id, p.dir, p.label, p.type)),
      state: {} as Record<string, unknown>,
    }]),
  )
  const edges: Array<{ from: { node: string; pin: string }; to: { node: string; pin: string } }> = []
  for (const e of seed.edges ?? []) edges.push({ from: { node: e.from, pin: 'x' }, to: { node: e.to, pin: 'x' } })
  return {
    _calls: calls, _nodes: nodes as never, _edges: edges as never,
    registry: { all: () => [
      { type: 'Box', title: 'Box', category: 'Math', pins: [{ direction: 'in', kind: 'data', type: 'float', label: 'In' }, { direction: 'out', kind: 'data', type: 'float', label: 'Out' }] },
      { type: 'Add', title: 'Add', category: 'Math', pins: [{ direction: 'in', kind: 'data', type: 'float', label: 'A' }, { direction: 'in', kind: 'data', type: 'float', label: 'B' }, { direction: 'out', kind: 'data', type: 'float', label: 'Sum' }] },
    ] },
    toJSON: () => { calls.push('toJSON'); return { version: 'xenolith.v1', nodes: [], edges: [] } },
    insertNode: (type, pos) => {
      calls.push(`insertNode:${type}@${pos.x},${pos.y}`)
      if (type === 'Unknown') return null
      const id = 'n_' + type + '_' + nodes.size
      const node = { id, type, position: { x: pos.x, y: pos.y }, size: { x: 200, y: 100 }, pins: [pin(`${id}:in`, 'in', 'In'), pin(`${id}:out`, 'out', 'Out')], state: {} as Record<string, unknown> }
      nodes.set(id, node)
      return node as ReturnType<McpEditorSurface['insertNode']>
    },
    addEdge: (edge) => {
      calls.push(`addEdge:${edge.from.node}.${edge.from.pin}->${edge.to.node}.${edge.to.pin}`)
      edges.push({ from: { node: String(edge.from.node), pin: String(edge.from.pin) }, to: { node: String(edge.to.node), pin: String(edge.to.pin) } })
      return true
    },
    fitView: (opts) => { calls.push(`fitView:${JSON.stringify(opts ?? {})}`) },
    moveNode: (id, p) => {
      calls.push(`moveNode:${id}->${p.x},${p.y}`)
      const n = nodes.get(id as string); if (n) n.position = p
    },
    setWidgetValue: (id, w, v) => calls.push(`setWidget:${id}.${w}=${JSON.stringify(v)}`),
    removeNode: (id) => { calls.push(`removeNode:${id}`); return nodes.delete(id as string) },
    disconnectEdge: (id) => { calls.push(`disconnectEdge:${id}`); return true },
    createMacroFromSelection: (ids, title) => { calls.push(`macro:${ids?.join(',')}:${title}`); return 'm_1' as never },
    expandMacro: (id) => calls.push(`expand:${id}`),
    collapseMacro: (id) => calls.push(`collapse:${id}`),
    graph: {
      nodes: () => nodes.values() as never,
      edges: () => edges as never,
      getNode: (id) => nodes.get(id as string) as never,
    },
  }
}

describe('buildHandlers', () => {
  it('list_node_types projects registry with pin details', async () => {
    const ed = makeMockEditor()
    const r = await buildHandlers(ed)['list_node_types']!({}) as Array<{ type: string; pins: Array<{ index: number; label: string | null; direction: string; type: string }> }>
    expect(r.map((x) => x.type)).toEqual(['Box', 'Add'])
    expect(r[0]!.pins).toHaveLength(2)
    expect(r[0]!.pins[0]).toMatchObject({ index: 0, label: 'In', direction: 'in', type: 'float' })
    expect(r[1]!.pins[2]).toMatchObject({ index: 2, label: 'Sum', direction: 'out' })
  })

  it('add_node calls insertNode and returns id + position', async () => {
    const ed = makeMockEditor()
    const r = await buildHandlers(ed)['add_node']!({ type: 'Box', x: 10, y: 20 }) as { id: string; position: { x: number; y: number } }
    expect(r.id).toBe('n_Box_0')
    expect(r.position).toEqual({ x: 10, y: 20 })
    expect(ed._calls).toContain('insertNode:Box@10,20')
  })

  it('add_node without coords drops at origin when graph is empty', async () => {
    const ed = makeMockEditor()
    const r = await buildHandlers(ed)['add_node']!({ type: 'Box' }) as { position: { x: number; y: number } }
    expect(r.position).toEqual({ x: 0, y: 0 })
  })

  it('add_node without coords lands to the right of existing nodes', async () => {
    const ed = makeMockEditor({ nodes: [{ id: 'a', x: 0, y: 0, w: 200 }] })
    const r = await buildHandlers(ed)['add_node']!({ type: 'Box' }) as { position: { x: number; y: number } }
    expect(r.position.x).toBeGreaterThanOrEqual(200)
  })

  it('auto_layout treats a macro as a single layout unit and moves members with it', async () => {
    const ed = makeMockEditor({
      nodes: [
        { id: 'a', x: 0, y: 0 },
        { id: 'macro', type: 'Macro', x: 0, y: 0 },
        { id: 't', x: -500, y: -500 }, // member, in some far-away spot
        { id: 'v', x: -500, y: -400 }, // member, offset 100 below t
        { id: 'b', x: 0, y: 0 },
      ],
      edges: [{ from: 'a', to: 'macro' }, { from: 'macro', to: 'b' }],
    })
    // Mark macro as collapsed with members [t, v]
    const macroNode = ed._nodes.get('macro')! as unknown as { state: Record<string, unknown> }
    macroNode.state = { collapsed: true, members: ['t', 'v'] }
    await buildHandlers(ed)['auto_layout']!({})
    const macroPos = ed._nodes.get('macro')!.position
    const tPos = ed._nodes.get('t')!.position
    const vPos = ed._nodes.get('v')!.position
    // Members moved by the same delta as the macro (so internal relative offset is preserved).
    expect(tPos.x - (-500)).toBeCloseTo(macroPos.x - 0, 1)
    expect(tPos.y - (-500)).toBeCloseTo(macroPos.y - 0, 1)
    expect(vPos.y - tPos.y).toBeCloseTo(100, 1) // relative offset preserved
  })

  it('auto_layout assigns columns to topological ranks (LR)', async () => {
    const ed = makeMockEditor({
      nodes: [
        { id: 'a', x: 0, y: 0 }, { id: 'b', x: 0, y: 0 }, { id: 'c', x: 0, y: 0 }, { id: 'd', x: 0, y: 0 },
      ],
      edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'b', to: 'd' }],
    })
    const r = await buildHandlers(ed)['auto_layout']!({}) as { moved: number; direction: string }
    expect(r.moved).toBe(4)
    expect(r.direction).toBe('LR')
    expect(ed._nodes.get('a')!.position.x).toBeLessThan(ed._nodes.get('b')!.position.x)
    expect(ed._nodes.get('b')!.position.x).toBeLessThan(ed._nodes.get('c')!.position.x)
    expect(ed._nodes.get('c')!.position.x).toEqual(ed._nodes.get('d')!.position.x) // same rank
  })

  it('add_node throws on unknown type', () => {
    const ed = makeMockEditor()
    expect(() => buildHandlers(ed)['add_node']!({ type: 'Unknown', x: 0, y: 0 })).toThrow(/unknown node type/)
  })

  it('connect_pins resolves pin by label and calls addEdge', async () => {
    const ed = makeMockEditor({
      nodes: [
        { id: 'n1', x: 0, y: 0, pins: [{ id: 'p1out', dir: 'out', label: 'Output' }] },
        { id: 'n2', x: 0, y: 0, pins: [{ id: 'p2in', dir: 'in', label: 'In' }] },
      ],
    })
    const r = await buildHandlers(ed)['connect_pins']!({
      from: { node: 'n1', pin: 'Output' },
      to:   { node: 'n2', pin: 'In' },
    }) as { id: string }
    expect(r.id).toMatch(/^[a-z0-9-]+$/i)
    expect(ed._calls.some((c) => c.startsWith('addEdge:n1.p1out->n2.p2in'))).toBe(true)
  })

  it('connect_pins resolves pin by numeric index', async () => {
    const ed = makeMockEditor({
      nodes: [
        { id: 'a', x: 0, y: 0, pins: [{ id: 'a_in', dir: 'in', label: 'X' }, { id: 'a_out', dir: 'out', label: 'Y' }] },
        { id: 'b', x: 0, y: 0, pins: [{ id: 'b_in', dir: 'in', label: 'Z' }] },
      ],
    })
    await buildHandlers(ed)['connect_pins']!({ from: { node: 'a', pin: 1 }, to: { node: 'b', pin: 0 } })
    expect(ed._calls.some((c) => c.includes('a.a_out->b.b_in'))).toBe(true)
  })

  it('connect_pins throws with helpful list if label not found', () => {
    const ed = makeMockEditor({
      nodes: [
        { id: 'a', x: 0, y: 0, pins: [{ id: 'a_out', dir: 'out', label: 'Result' }] },
        { id: 'b', x: 0, y: 0, pins: [{ id: 'b_in', dir: 'in', label: 'Input' }] },
      ],
    })
    expect(() => buildHandlers(ed)['connect_pins']!({
      from: { node: 'a', pin: 'WRONG' },
      to: { node: 'b', pin: 'Input' },
    })).toThrow(/available out pins: \[0:Result\(float\)\]/)
  })

  it('connect_pins resolves "out"/"in" for single-pin nodes', async () => {
    const ed = makeMockEditor({
      nodes: [
        { id: 'a', x: 0, y: 0, pins: [{ id: 'a_o', dir: 'out', label: 'Out' }] },
        { id: 'b', x: 0, y: 0, pins: [{ id: 'b_i', dir: 'in', label: 'In' }] },
      ],
    })
    await buildHandlers(ed)['connect_pins']!({ from: { node: 'a', pin: 'out' }, to: { node: 'b', pin: 'in' } })
    expect(ed._calls.some((c) => c.includes('a.a_o->b.b_i'))).toBe(true)
  })

  it('fit_view forwards padding', async () => {
    const ed = makeMockEditor()
    await buildHandlers(ed)['fit_view']!({ padding: 100 })
    expect(ed._calls).toContain('fitView:{"padding":100}')
  })

  it('get_graph returns toJSON output', async () => {
    const ed = makeMockEditor()
    const r = await buildHandlers(ed)['get_graph']!({}) as { version: string }
    expect(r.version).toBe('xenolith.v1')
  })
})

class FakeSocket implements McpSocketLike {
  onopen: ((ev: unknown) => void) | null = null
  onclose: ((ev: unknown) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  sent: string[] = []
  send(d: string): void { this.sent.push(d) }
  close(): void { this.onclose?.({}) }
  // helpers
  serverCall(id: string, tool: string, args?: unknown): void { this.onmessage?.({ data: JSON.stringify({ id, kind: 'call', tool, args }) }) }
  lastResult(): { id: string; kind: 'result'; ok: boolean; data?: unknown; error?: string } {
    return JSON.parse(this.sent[this.sent.length - 1]!)
  }
}

describe('McpClient', () => {
  it('replies with a result on a valid tool call', async () => {
    const ed = makeMockEditor()
    const sock = new FakeSocket()
    const client = new McpClient(ed)
    const p = client.connect('ws://fake', { socketFactory: () => sock })
    sock.onopen?.({})
    await p
    // first message is the hello
    expect(JSON.parse(sock.sent[0]!).kind).toBe('hello')

    sock.serverCall('c1', 'add_node', { type: 'Box', x: 5, y: 5 })
    await new Promise((r) => setTimeout(r, 0))
    const out = sock.lastResult()
    expect(out.ok).toBe(true)
    expect((out.data as { id: string }).id).toBe('n_Box_0')
  })

  it('replies with error on unknown tool', async () => {
    const ed = makeMockEditor()
    const sock = new FakeSocket()
    const client = new McpClient(ed)
    const p = client.connect('ws://fake', { socketFactory: () => sock })
    sock.onopen?.({})
    await p

    sock.serverCall('c1', 'eat_my_socks')
    await new Promise((r) => setTimeout(r, 0))
    const out = sock.lastResult()
    expect(out.ok).toBe(false)
    expect(out.error).toMatch(/unknown tool/)
  })

  it('replies with error when handler throws', async () => {
    const ed = makeMockEditor()
    const sock = new FakeSocket()
    const client = new McpClient(ed)
    const p = client.connect('ws://fake', { socketFactory: () => sock })
    sock.onopen?.({})
    await p

    sock.serverCall('c1', 'add_node', { type: 'Unknown', x: 0, y: 0 })
    await new Promise((r) => setTimeout(r, 0))
    const out = sock.lastResult()
    expect(out.ok).toBe(false)
    expect(out.error).toMatch(/unknown node type/)
  })
})
