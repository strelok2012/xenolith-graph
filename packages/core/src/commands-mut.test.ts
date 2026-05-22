import { describe, it, expect } from 'vitest'
import { CommandBus } from './command-bus.js'
import type { CommandContext, CoreEvents } from './command-bus.js'
import { EventEmitter } from './event-emitter.js'
import { Graph } from './graph.js'
import type { Node } from './graph.js'
import { createNodeId, createPinId } from './ids.js'
import { AddNode } from './commands.js'
import { MoveNode, ResizeNode, SetNodeState } from './commands-mut.js'

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
