import { describe, it, expect } from 'vitest'
import { CommandBus } from './command-bus.js'
import type { CommandContext, CoreEvents } from './command-bus.js'
import { EventEmitter } from './event-emitter.js'
import { Graph } from './graph.js'
import type { Node } from './graph.js'
import { createNodeId, createPinId, createEdgeId } from './ids.js'
import { AddNode, ConnectPins } from './commands.js'
import type { Pin } from './graph.js'
import { MoveNode, ResizeNode, SetNodeState, SetNodePins, SetNodeWidgets } from './commands-mut.js'

function makeNode(): Node {
  return {
    id: createNodeId(),
    type: 'Test',
    position: { x: 10, y: 20 },
    size: { x: 150, y: 70 },
    state: { label: 'hello', count: 1 },
    pins: [
      { id: createPinId(), kind: 'data', direction: 'in', type: 'float', multiple: false },
    ],
  }
}

function makeBus(): { bus: CommandBus; ctx: CommandContext; n: Node } {
  const events = new EventEmitter<CoreEvents>()
  const graph = new Graph()
  const ctx: CommandContext = { graph, events }
  const bus = new CommandBus(ctx)
  const n = makeNode()
  bus.apply(new AddNode(n))
  return { bus, ctx, n }
}

describe('MoveNode', () => {
  it('updates the node position', () => {
    const { bus, ctx, n } = makeBus()
    bus.apply(new MoveNode(n.id, { x: 100, y: 200 }))
    expect(ctx.graph.getNode(n.id)?.position).toEqual({ x: 100, y: 200 })
  })

  it('undo restores the original position', () => {
    const { bus, ctx, n } = makeBus()
    bus.apply(new MoveNode(n.id, { x: 100, y: 200 }))
    bus.undo()
    expect(ctx.graph.getNode(n.id)?.position).toEqual({ x: 10, y: 20 })
  })

  it('redo re-applies the new position', () => {
    const { bus, ctx, n } = makeBus()
    bus.apply(new MoveNode(n.id, { x: 100, y: 200 }))
    bus.undo()
    bus.redo()
    expect(ctx.graph.getNode(n.id)?.position).toEqual({ x: 100, y: 200 })
  })

  it('captures by value — mutating the input Vec2 after apply does not affect the node', () => {
    const { bus, ctx, n } = makeBus()
    const target = { x: 100, y: 200 }
    bus.apply(new MoveNode(n.id, target))
    target.x = 999
    expect(ctx.graph.getNode(n.id)?.position).toEqual({ x: 100, y: 200 })
  })

  it('throws if the node does not exist', () => {
    const { bus } = makeBus()
    expect(() => bus.apply(new MoveNode(createNodeId(), { x: 0, y: 0 }))).toThrow(/not found/i)
  })

  it('bumps graph.version', () => {
    const { bus, ctx, n } = makeBus()
    const before = ctx.graph.version
    bus.apply(new MoveNode(n.id, { x: 50, y: 60 }))
    expect(ctx.graph.version).toBe(before + 1)
  })
})

describe('ResizeNode', () => {
  it('updates the node size', () => {
    const { bus, ctx, n } = makeBus()
    bus.apply(new ResizeNode(n.id, { x: 300, y: 100 }))
    expect(ctx.graph.getNode(n.id)?.size).toEqual({ x: 300, y: 100 })
  })

  it('undo restores the original size', () => {
    const { bus, ctx, n } = makeBus()
    bus.apply(new ResizeNode(n.id, { x: 300, y: 100 }))
    bus.undo()
    expect(ctx.graph.getNode(n.id)?.size).toEqual({ x: 150, y: 70 })
  })

  it('throws if the node does not exist', () => {
    const { bus } = makeBus()
    expect(() => bus.apply(new ResizeNode(createNodeId(), { x: 1, y: 1 }))).toThrow(/not found/i)
  })
})

describe('SetNodeState', () => {
  it('merges the partial into node.state', () => {
    const { bus, ctx, n } = makeBus()
    bus.apply(new SetNodeState(n.id, { label: 'world' }))
    expect(ctx.graph.getNode(n.id)?.state).toEqual({ label: 'world', count: 1 })
  })

  it('overwrites existing keys but leaves others intact', () => {
    const { bus, ctx, n } = makeBus()
    bus.apply(new SetNodeState(n.id, { count: 42, extra: true }))
    expect(ctx.graph.getNode(n.id)?.state).toEqual({ label: 'hello', count: 42, extra: true })
  })

  it('undo restores the entire prior state snapshot', () => {
    const { bus, ctx, n } = makeBus()
    bus.apply(new SetNodeState(n.id, { count: 42, extra: true }))
    bus.undo()
    expect(ctx.graph.getNode(n.id)?.state).toEqual({ label: 'hello', count: 1 })
  })

  it('throws if the node does not exist', () => {
    const { bus } = makeBus()
    expect(() => bus.apply(new SetNodeState(createNodeId(), { x: 1 }))).toThrow(/not found/i)
  })

  it('redo re-applies the merge', () => {
    const { bus, ctx, n } = makeBus()
    bus.apply(new SetNodeState(n.id, { label: 'world' }))
    bus.undo()
    bus.redo()
    expect(ctx.graph.getNode(n.id)?.state).toEqual({ label: 'world', count: 1 })
  })
})

describe('SetNodePins', () => {
  const dataPin = (over: Partial<Pin>): Pin => ({
    id: createPinId(), kind: 'data', direction: 'in', type: 'float', multiple: false, ...over,
  })

  function setup() {
    const events = new EventEmitter<CoreEvents>()
    const graph = new Graph()
    const ctx: CommandContext = { graph, events }
    const bus = new CommandBus(ctx)
    const outPin = createPinId(), inPin = createPinId()
    const a: Node = { id: createNodeId(), type: 'A', position: { x: 0, y: 0 }, state: {}, pins: [dataPin({ id: outPin, direction: 'out', multiple: true })] }
    const b: Node = { id: createNodeId(), type: 'B', position: { x: 200, y: 0 }, state: {}, pins: [dataPin({ id: inPin, direction: 'in', label: 'X' })] }
    bus.apply(new AddNode(a)); bus.apply(new AddNode(b))
    const edgeId = createEdgeId()
    bus.apply(new ConnectPins({ id: edgeId, from: { node: a.id, pin: outPin }, to: { node: b.id, pin: inPin } }))
    return { bus, ctx, a, b, inPin, outPin, edgeId }
  }

  it('replaces the node pins', () => {
    const { bus, ctx, b } = setup()
    const np = createPinId()
    bus.apply(new SetNodePins(b.id, [dataPin({ id: np, type: 'string', label: 'Y' })]))
    expect(ctx.graph.getNode(b.id)!.pins.map((p) => p.id)).toEqual([np])
    expect(ctx.graph.getNode(b.id)!.pins[0]!.label).toBe('Y')
  })

  it('prunes edges incident to removed pins; undo restores both pins and edges', () => {
    const { bus, ctx, b, edgeId } = setup()
    bus.apply(new SetNodePins(b.id, [dataPin({})])) // replaces the targeted inPin → edge must drop
    expect(ctx.graph.hasEdge(edgeId)).toBe(false)
    bus.undo()
    expect(ctx.graph.hasEdge(edgeId)).toBe(true)
    expect(ctx.graph.getNode(b.id)!.pins.map((p) => p.label)).toEqual(['X'])
  })

  it('keeps edges on pins that survive the replacement', () => {
    const { bus, ctx, b, edgeId } = setup()
    const kept = ctx.graph.getNode(b.id)!.pins[0]! // same inPin id survives
    bus.apply(new SetNodePins(b.id, [kept, dataPin({})]))
    expect(ctx.graph.hasEdge(edgeId)).toBe(true)
  })

  it('redo re-applies and prunes the edge again', () => {
    const { bus, ctx, b, edgeId } = setup()
    bus.apply(new SetNodePins(b.id, [dataPin({})]))
    bus.undo(); bus.redo()
    expect(ctx.graph.hasEdge(edgeId)).toBe(false)
  })

  it('throws if the node does not exist', () => {
    const { bus } = setup()
    expect(() => bus.apply(new SetNodePins(createNodeId(), []))).toThrow(/not found/i)
  })

  it('bumps graph.version', () => {
    const { bus, ctx, b } = setup()
    const before = ctx.graph.version
    bus.apply(new SetNodePins(b.id, [dataPin({})]))
    expect(ctx.graph.version).toBeGreaterThan(before)
  })
})

describe('SetNodeWidgets', () => {
  function setup() {
    const events = new EventEmitter<CoreEvents>()
    const graph = new Graph()
    const ctx: CommandContext = { graph, events }
    const bus = new CommandBus(ctx)
    const a: Node = {
      id: createNodeId(), type: 'A', position: { x: 0, y: 0 }, state: { name: 'Ada', priority: 7 }, pins: [],
      widgets: [{ id: 'name', type: 'text', label: '', key: 'name' }],
    }
    bus.apply(new AddNode(a))
    return { bus, ctx, a }
  }

  it('replaces the widget list wholesale', () => {
    const { bus, ctx, a } = setup()
    bus.apply(new SetNodeWidgets(a.id, [
      { id: 'priority', type: 'number', label: '', key: 'priority' },
      { id: 'flag',     type: 'toggle', label: '', key: 'flag'     },
    ]))
    expect(ctx.graph.getNode(a.id)!.widgets!.map((w) => w.id)).toEqual(['priority', 'flag'])
  })

  it('passing undefined removes widgets entirely', () => {
    const { bus, ctx, a } = setup()
    bus.apply(new SetNodeWidgets(a.id, undefined))
    expect(ctx.graph.getNode(a.id)!.widgets).toBeUndefined()
  })

  it("does NOT touch node.state[key] — re-adding a widget under the same key restores its value", () => {
    const { bus, ctx, a } = setup()
    bus.apply(new SetNodeWidgets(a.id, undefined))            // widget removed; state.name STAYS
    expect(ctx.graph.getNode(a.id)!.state['name']).toBe('Ada')
    bus.apply(new SetNodeWidgets(a.id, [{ id: 'name', type: 'text', label: '', key: 'name' }]))
    expect(ctx.graph.getNode(a.id)!.state['name']).toBe('Ada') // and is still 'Ada' on re-add
  })

  it('undo restores the prior widget list (including the original ids)', () => {
    const { bus, ctx, a } = setup()
    bus.apply(new SetNodeWidgets(a.id, [{ id: 'flag', type: 'toggle', label: '', key: 'flag' }]))
    bus.undo()
    expect(ctx.graph.getNode(a.id)!.widgets!.map((w) => w.id)).toEqual(['name'])
  })

  it('redo re-applies the replacement', () => {
    const { bus, ctx, a } = setup()
    bus.apply(new SetNodeWidgets(a.id, [{ id: 'flag', type: 'toggle', label: '', key: 'flag' }]))
    bus.undo(); bus.redo()
    expect(ctx.graph.getNode(a.id)!.widgets!.map((w) => w.id)).toEqual(['flag'])
  })

  it('throws if the node does not exist', () => {
    const { bus } = setup()
    expect(() => bus.apply(new SetNodeWidgets(createNodeId(), []))).toThrow(/not found/i)
  })

  it('bumps graph.version', () => {
    const { bus, ctx, a } = setup()
    const before = ctx.graph.version
    bus.apply(new SetNodeWidgets(a.id, [{ id: 'x', type: 'number', label: '', key: 'x' }]))
    expect(ctx.graph.version).toBeGreaterThan(before)
  })
})

describe('Graph._patchNode (internal)', () => {
  it('returns undefined for an unknown id and does not bump version', () => {
    const { ctx } = makeBus()
    const before = ctx.graph.version
    expect(ctx.graph._patchNode(createNodeId(), { position: { x: 1, y: 1 } })).toBeUndefined()
    expect(ctx.graph.version).toBe(before)
  })

  it('bumps version on a real patch', () => {
    const { ctx, n } = makeBus()
    const before = ctx.graph.version
    ctx.graph._patchNode(n.id, { position: { x: 5, y: 5 } })
    expect(ctx.graph.version).toBe(before + 1)
  })
})
