import { describe, it, expect } from 'vitest'
import { CommandBus } from './command-bus.js'
import type { CommandContext, CoreEvents } from './command-bus.js'
import { EventEmitter } from './event-emitter.js'
import { Graph } from './graph.js'
import type { Node, Edge } from './graph.js'
import { createNodeId, createEdgeId, createPinId } from './ids.js'
import { AddNode, RemoveNode, ConnectPins, DisconnectEdge } from './commands.js'

function makeNode(): Node {
  const id = createNodeId()
  return {
    id,
    type: 'Test',
    position: { x: 0, y: 0 },
    state: {},
    pins: [
      { id: createPinId(), kind: 'data', direction: 'in',  type: 'float', multiple: false },
      { id: createPinId(), kind: 'data', direction: 'out', type: 'float', multiple: true  },
    ],
  }
}

function makeEdge(a: Node, b: Node): Edge {
  return {
    id: createEdgeId(),
    from: { node: a.id, pin: a.pins[1]!.id },
    to:   { node: b.id, pin: b.pins[0]!.id },
  }
}

function makeBus(): { bus: CommandBus; ctx: CommandContext } {
  const events = new EventEmitter<CoreEvents>()
  const graph = new Graph()
  const ctx: CommandContext = { graph, events }
  return { bus: new CommandBus(ctx), ctx }
}

describe('AddNode', () => {
  it('adds the node to the graph', () => {
    const { bus, ctx } = makeBus()
    const n = makeNode()
    bus.apply(new AddNode(n))
    expect(ctx.graph.getNode(n.id)).toEqual(n)
  })

  it('undo removes the node', () => {
    const { bus, ctx } = makeBus()
    const n = makeNode()
    bus.apply(new AddNode(n))
    bus.undo()
    expect(ctx.graph.hasNode(n.id)).toBe(false)
  })

  it('redo restores the node', () => {
    const { bus, ctx } = makeBus()
    const n = makeNode()
    bus.apply(new AddNode(n))
    bus.undo()
    bus.redo()
    expect(ctx.graph.getNode(n.id)).toEqual(n)
  })

  it('rejects duplicate node ids', () => {
    const { bus } = makeBus()
    const n = makeNode()
    bus.apply(new AddNode(n))
    expect(() => bus.apply(new AddNode(n))).toThrow(/duplicate/i)
  })
})

describe('RemoveNode', () => {
  it('removes the target node', () => {
    const { bus, ctx } = makeBus()
    const n = makeNode()
    bus.apply(new AddNode(n))
    bus.apply(new RemoveNode(n.id))
    expect(ctx.graph.hasNode(n.id)).toBe(false)
  })

  it('cascade-removes every edge attached to the node', () => {
    const { bus, ctx } = makeBus()
    const a = makeNode()
    const b = makeNode()
    bus.apply(new AddNode(a))
    bus.apply(new AddNode(b))
    const e1 = makeEdge(a, b)
    const e2 = makeEdge(a, b)
    bus.apply(new ConnectPins(e1))
    bus.apply(new ConnectPins(e2))
    bus.apply(new RemoveNode(a.id))
    expect(ctx.graph.edgeCount).toBe(0)
  })

  it('undo restores the node and every cascaded edge in one step', () => {
    const { bus, ctx } = makeBus()
    const a = makeNode()
    const b = makeNode()
    bus.apply(new AddNode(a))
    bus.apply(new AddNode(b))
    const e1 = makeEdge(a, b)
    const e2 = makeEdge(a, b)
    bus.apply(new ConnectPins(e1))
    bus.apply(new ConnectPins(e2))
    bus.apply(new RemoveNode(a.id))
    bus.undo()
    expect(ctx.graph.hasNode(a.id)).toBe(true)
    expect(ctx.graph.hasEdge(e1.id)).toBe(true)
    expect(ctx.graph.hasEdge(e2.id)).toBe(true)
  })

  it('does not touch unrelated edges', () => {
    const { bus, ctx } = makeBus()
    const a = makeNode()
    const b = makeNode()
    const c = makeNode()
    bus.apply(new AddNode(a))
    bus.apply(new AddNode(b))
    bus.apply(new AddNode(c))
    const eAB = makeEdge(a, b)
    const eBC = makeEdge(b, c)
    bus.apply(new ConnectPins(eAB))
    bus.apply(new ConnectPins(eBC))
    bus.apply(new RemoveNode(a.id))
    expect(ctx.graph.hasEdge(eAB.id)).toBe(false)
    expect(ctx.graph.hasEdge(eBC.id)).toBe(true)
  })

  it('throws if the node does not exist', () => {
    const { bus } = makeBus()
    expect(() => bus.apply(new RemoveNode(createNodeId()))).toThrow(/not found/i)
  })
})

describe('ConnectPins', () => {
  it('adds the edge to the graph', () => {
    const { bus, ctx } = makeBus()
    const a = makeNode()
    const b = makeNode()
    bus.apply(new AddNode(a))
    bus.apply(new AddNode(b))
    const e = makeEdge(a, b)
    bus.apply(new ConnectPins(e))
    expect(ctx.graph.getEdge(e.id)).toEqual(e)
  })

  it('undo removes the edge', () => {
    const { bus, ctx } = makeBus()
    const a = makeNode()
    const b = makeNode()
    bus.apply(new AddNode(a))
    bus.apply(new AddNode(b))
    const e = makeEdge(a, b)
    bus.apply(new ConnectPins(e))
    bus.undo()
    expect(ctx.graph.hasEdge(e.id)).toBe(false)
  })
})

describe('DisconnectEdge', () => {
  it('removes the edge', () => {
    const { bus, ctx } = makeBus()
    const a = makeNode()
    const b = makeNode()
    bus.apply(new AddNode(a))
    bus.apply(new AddNode(b))
    const e = makeEdge(a, b)
    bus.apply(new ConnectPins(e))
    bus.apply(new DisconnectEdge(e.id))
    expect(ctx.graph.hasEdge(e.id)).toBe(false)
  })

  it('undo restores the edge', () => {
    const { bus, ctx } = makeBus()
    const a = makeNode()
    const b = makeNode()
    bus.apply(new AddNode(a))
    bus.apply(new AddNode(b))
    const e = makeEdge(a, b)
    bus.apply(new ConnectPins(e))
    bus.apply(new DisconnectEdge(e.id))
    bus.undo()
    expect(ctx.graph.getEdge(e.id)).toEqual(e)
  })

  it('throws if the edge does not exist', () => {
    const { bus } = makeBus()
    expect(() => bus.apply(new DisconnectEdge(createEdgeId()))).toThrow(/not found/i)
  })
})

describe('Composition — transaction', () => {
  it('grouping AddNode + ConnectPins undoes both in one step', () => {
    const { bus, ctx } = makeBus()
    const a = makeNode()
    const b = makeNode()
    bus.apply(new AddNode(a))
    bus.apply(new AddNode(b))
    const e = makeEdge(a, b)
    bus.transaction(() => {
      bus.apply(new ConnectPins(e))
    })
    bus.undo()
    expect(ctx.graph.hasEdge(e.id)).toBe(false)
    expect(ctx.graph.hasNode(a.id)).toBe(true)
    expect(ctx.graph.hasNode(b.id)).toBe(true)
  })

  it('failure mid-transaction rolls back partial graph mutations', () => {
    const { bus, ctx } = makeBus()
    const a = makeNode()
    const b = makeNode()
    expect(() =>
      bus.transaction(() => {
        bus.apply(new AddNode(a))
        bus.apply(new AddNode(b))
        throw new Error('user cancelled')
      }),
    ).toThrow('user cancelled')
    expect(ctx.graph.nodeCount).toBe(0)
  })
})
