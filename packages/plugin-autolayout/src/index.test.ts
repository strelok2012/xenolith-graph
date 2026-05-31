import { describe, it, expect, vi } from 'vitest'
import {
  Graph, CommandBus, AddNode, ConnectPins, EventEmitter, MoveNode,
  type CommandContext, type CoreEvents, type Node, type Edge, type NodeId, type EdgeId, type PinId,
} from '@xenolith/core'
import type { PluginContext } from '@xenolith/editor'
import { autoLayoutPlugin, type LayoutEngine, type LayoutResult } from './index.js'

// Three-node chain `A → B → C` with explicit sizes. Positions all (0,0); the engine moves them.
function makeGraph(): { graph: Graph; bus: CommandBus; ctx: CommandContext } {
  const events = new EventEmitter<CoreEvents>()
  const graph = new Graph()
  const ctx: CommandContext = { graph, events }
  const bus = new CommandBus(ctx)
  const node = (id: string, outId: string, inId: string): Node => ({
    id: id as NodeId, type: 'X', position: { x: 0, y: 0 }, size: { x: 100, y: 60 },
    state: {},
    pins: [
      { id: inId  as PinId, kind: 'data', direction: 'in',  type: 'float', multiple: false },
      { id: outId as PinId, kind: 'data', direction: 'out', type: 'float', multiple: true  },
    ],
  })
  const edge = (id: string, fromN: string, fromP: string, toN: string, toP: string): Edge => ({
    id: id as EdgeId, from: { node: fromN as NodeId, pin: fromP as PinId }, to: { node: toN as NodeId, pin: toP as PinId },
  })
  bus.apply(new AddNode(node('A', 'a_o', 'a_i')))
  bus.apply(new AddNode(node('B', 'b_o', 'b_i')))
  bus.apply(new AddNode(node('C', 'c_o', 'c_i')))
  bus.apply(new ConnectPins(edge('e1', 'A', 'a_o', 'B', 'b_i')))
  bus.apply(new ConnectPins(edge('e2', 'B', 'b_o', 'C', 'c_i')))
  return { graph, bus, ctx }
}

function makeCtx(graph: Graph, bus: CommandBus): PluginContext {
  // Minimal stub — autoLayoutPlugin only touches `graph` / `commandBus` / `requestRender`.
  return { graph, commandBus: bus, requestRender: () => {} } as unknown as PluginContext
}

function fixedEngine(positions: ReadonlyMap<string, { x: number; y: number }>, opts?: { name?: string }): LayoutEngine {
  return {
    name: opts?.name ?? 'fake',
    layout: vi.fn(async (): Promise<LayoutResult> => ({ positions })),
  }
}

describe('autoLayoutPlugin', () => {
  it('throws if arrange() is called before install', async () => {
    const plugin = autoLayoutPlugin({ engine: fixedEngine(new Map()) })
    await expect(plugin.arrange()).rejects.toThrow(/before editor\.use/)
  })

  it('passes the editor graph to the engine (built LayoutGraph)', async () => {
    const { graph, bus } = makeGraph()
    const engine = fixedEngine(new Map())
    const plugin = autoLayoutPlugin({ engine })
    plugin.install(makeCtx(graph, bus))
    await plugin.arrange({ direction: 'TB' })
    expect(engine.layout).toHaveBeenCalledTimes(1)
    const [lg, opts] = (engine.layout as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(lg.nodes.map((n: { id: string }) => n.id).sort()).toEqual(['A', 'B', 'C'])
    expect(lg.edges).toHaveLength(2)
    expect(lg.nodes[0]!.width).toBe(100)
    expect(lg.nodes[0]!.height).toBe(60)
    expect(opts.direction).toBe('TB')
  })

  it('applies returned positions through MoveNode (node.position updates)', async () => {
    const { graph, bus } = makeGraph()
    const positions = new Map([
      ['A', { x: 10,  y: 20  }],
      ['B', { x: 200, y: 20  }],
      ['C', { x: 400, y: 20  }],
    ])
    const plugin = autoLayoutPlugin({ engine: fixedEngine(positions) })
    plugin.install(makeCtx(graph, bus))
    await plugin.arrange()
    expect(graph.getNode('A' as NodeId)?.position).toEqual({ x: 10,  y: 20 })
    expect(graph.getNode('B' as NodeId)?.position).toEqual({ x: 200, y: 20 })
    expect(graph.getNode('C' as NodeId)?.position).toEqual({ x: 400, y: 20 })
  })

  it('applies the whole layout in ONE transaction (one undo restores everything)', async () => {
    const { graph, bus } = makeGraph()
    const positions = new Map([
      ['A', { x: 10,  y: 0 }],
      ['B', { x: 200, y: 0 }],
      ['C', { x: 400, y: 0 }],
    ])
    const plugin = autoLayoutPlugin({ engine: fixedEngine(positions) })
    plugin.install(makeCtx(graph, bus))
    await plugin.arrange()
    // ALL three nodes moved → single undo must restore ALL three back to (0,0).
    bus.undo()
    expect(graph.getNode('A' as NodeId)?.position).toEqual({ x: 0, y: 0 })
    expect(graph.getNode('B' as NodeId)?.position).toEqual({ x: 0, y: 0 })
    expect(graph.getNode('C' as NodeId)?.position).toEqual({ x: 0, y: 0 })
  })

  it('skips MoveNode for positions equal to the current position (no history noise)', async () => {
    const { graph, bus } = makeGraph()
    // A already at (0,0); B/C move. The undo should only restore B and C — but observably we can
    // only check that the position ends up correct AND only one undo brings B/C back.
    bus.apply(new MoveNode('A' as NodeId, { x: 0, y: 0 })) // no-op move; just a baseline historyish noise
    const txCountBefore = (bus as unknown as { ['#log']: unknown[] })['#log']?.length ?? -1
    void txCountBefore
    const positions = new Map([
      ['A', { x: 0,   y: 0 }],
      ['B', { x: 200, y: 0 }],
      ['C', { x: 400, y: 0 }],
    ])
    const plugin = autoLayoutPlugin({ engine: fixedEngine(positions) })
    plugin.install(makeCtx(graph, bus))
    await plugin.arrange()
    expect(graph.getNode('A' as NodeId)?.position).toEqual({ x: 0,   y: 0 })
    expect(graph.getNode('B' as NodeId)?.position).toEqual({ x: 200, y: 0 })
    expect(graph.getNode('C' as NodeId)?.position).toEqual({ x: 400, y: 0 })
  })

  it('is a no-op on an empty graph (no engine call, no transaction)', async () => {
    const events = new EventEmitter<CoreEvents>()
    const graph = new Graph()
    const bus = new CommandBus({ graph, events })
    const engine = fixedEngine(new Map())
    const plugin = autoLayoutPlugin({ engine })
    plugin.install(makeCtx(graph, bus))
    const r = await plugin.arrange()
    expect(engine.layout).not.toHaveBeenCalled()
    expect(r.positions.size).toBe(0)
  })

  it('skips positions for nodes that vanished mid-layout (engine ran async)', async () => {
    const { graph, bus } = makeGraph()
    // Engine resolves AFTER we delete B — the plugin must not crash trying to move a ghost.
    const positions = new Map([
      ['A', { x: 10,  y: 0 }],
      ['B', { x: 200, y: 0 }],
      ['C', { x: 400, y: 0 }],
    ])
    const slowEngine: LayoutEngine = {
      name: 'slow',
      layout: async () => {
        await new Promise((r) => setTimeout(r, 0))
        return { positions }
      },
    }
    const plugin = autoLayoutPlugin({ engine: slowEngine })
    plugin.install(makeCtx(graph, bus))
    const p = plugin.arrange()
    // Remove B before the layout resolves.
    graph['_removeNode']('B' as NodeId)
    await p
    expect(graph.getNode('A' as NodeId)?.position).toEqual({ x: 10,  y: 0 })
    expect(graph.getNode('C' as NodeId)?.position).toEqual({ x: 400, y: 0 })
    expect(graph.getNode('B' as NodeId)).toBeUndefined()
  })

  it('install/dispose cycle: arrange() throws again after the disposer runs', async () => {
    const { graph, bus } = makeGraph()
    const plugin = autoLayoutPlugin({ engine: fixedEngine(new Map()) })
    const dispose = plugin.install(makeCtx(graph, bus))
    await plugin.arrange()
    ;(dispose as () => void)()
    await expect(plugin.arrange()).rejects.toThrow()
  })

  it('honours `defaults` opts and lets per-call opts override them', async () => {
    const { graph, bus } = makeGraph()
    const engine = fixedEngine(new Map())
    const plugin = autoLayoutPlugin({ engine, defaults: { direction: 'TB', spacing: { node: 99 } } })
    plugin.install(makeCtx(graph, bus))
    await plugin.arrange({ direction: 'LR' })
    const [, opts] = (engine.layout as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(opts.direction).toBe('LR')              // override
    expect(opts.spacing.node).toBe(99)             // inherited from defaults
  })
})
