import { describe, it, expect } from 'vitest'
import {
  CommandBus,
  EventEmitter,
  Graph,
  AddNode,
  RemoveNode,
  ConnectPins,
  DisconnectEdge,
  MoveNode,
  createNodeId,
  createEdgeId,
  createPinId,
  type CommandContext,
  type CoreEvents,
  type Node,
  type Edge,
} from '@xenolith/core'
import { createGraphEventBridge, type EditorEvents } from './events.js'

function makeNode(): Node {
  return {
    id: createNodeId(),
    type: 'Test',
    position: { x: 0, y: 0 },
    state: {},
    pins: [
      { id: createPinId(), kind: 'data', direction: 'in', type: 'float', multiple: false },
      { id: createPinId(), kind: 'data', direction: 'out', type: 'float', multiple: true },
    ],
  }
}
function makeEdge(a: Node, b: Node): Edge {
  return { id: createEdgeId(), from: { node: a.id, pin: a.pins[1]!.id }, to: { node: b.id, pin: b.pins[0]!.id } }
}

function harness() {
  const coreEvents = new EventEmitter<CoreEvents>()
  const graph = new Graph()
  const ctx: CommandContext = { graph, events: coreEvents }
  const cmdBus = new CommandBus(ctx)
  const bus = new EventEmitter<EditorEvents>()
  const log: Array<{ event: keyof EditorEvents; payload: unknown }> = []
  const off = createGraphEventBridge({
    coreEvents, graph, bus,
    canUndo: () => cmdBus.canUndo(),
    canRedo: () => cmdBus.canRedo(),
  })
  const record = <K extends keyof EditorEvents>(e: K): void => { bus.on(e, (p) => log.push({ event: e, payload: p })) }
  return { graph, cmdBus, bus, log, off, record }
}

describe('createGraphEventBridge', () => {
  it('emits node:added when an AddNode command is applied (programmatic, interaction, or paste)', () => {
    const h = harness(); h.record('node:added')
    const n = makeNode()
    h.cmdBus.apply(new AddNode(n))
    expect(h.log).toEqual([{ event: 'node:added', payload: { node: n } }])
  })

  it('emits node:removed when a RemoveNode command is applied', () => {
    const h = harness(); const n = makeNode(); h.cmdBus.apply(new AddNode(n))
    h.record('node:removed')
    h.cmdBus.apply(new RemoveNode(n.id))
    expect(h.log).toEqual([{ event: 'node:removed', payload: { nodeId: n.id } }])
  })

  it('emits edge:connected / edge:disconnected for ConnectPins / DisconnectEdge', () => {
    const h = harness(); const a = makeNode(); const b = makeNode()
    h.cmdBus.apply(new AddNode(a)); h.cmdBus.apply(new AddNode(b))
    const e = makeEdge(a, b)
    h.record('edge:connected'); h.record('edge:disconnected')
    h.cmdBus.apply(new ConnectPins(e))
    h.cmdBus.apply(new DisconnectEdge(e.id))
    expect(h.log).toEqual([
      { event: 'edge:connected', payload: { edge: e } },
      { event: 'edge:disconnected', payload: { edgeId: e.id } },
    ])
  })

  it('emits node:moved with the new position when a node is moved', () => {
    const h = harness(); const n = makeNode(); h.cmdBus.apply(new AddNode(n))
    h.record('node:moved')
    h.cmdBus.apply(new MoveNode(n.id, { x: 40, y: 12 }))
    expect(h.log).toEqual([{ event: 'node:moved', payload: { nodeId: n.id, position: { x: 40, y: 12 } } }])
  })

  it('reverses the event on undo (AddNode→node:removed, RemoveNode→node:added)', () => {
    const h = harness(); const n = makeNode()
    h.cmdBus.apply(new AddNode(n))
    h.record('node:added'); h.record('node:removed')
    h.cmdBus.undo()
    expect(h.log).toEqual([{ event: 'node:removed', payload: { nodeId: n.id } }])
    h.cmdBus.redo()
    expect(h.log.at(-1)).toEqual({ event: 'node:added', payload: { node: n } })
  })

  it('re-emits the forward event on redo (ConnectPins)', () => {
    const h = harness(); const a = makeNode(); const b = makeNode()
    h.cmdBus.apply(new AddNode(a)); h.cmdBus.apply(new AddNode(b))
    const e = makeEdge(a, b); h.cmdBus.apply(new ConnectPins(e))
    h.cmdBus.undo()
    h.record('edge:connected')
    h.cmdBus.redo()
    expect(h.log).toEqual([{ event: 'edge:connected', payload: { edge: e } }])
  })

  it('emits history:changed with canUndo/canRedo after every command', () => {
    const h = harness(); const n = makeNode()
    h.record('history:changed')
    h.cmdBus.apply(new AddNode(n))
    h.cmdBus.undo()
    expect(h.log).toEqual([
      { event: 'history:changed', payload: { canUndo: true, canRedo: false } },
      { event: 'history:changed', payload: { canUndo: false, canRedo: true } },
    ])
  })

  it('emits history:changed after a TRANSACTION commits (drag-commit, delete) with a fresh stack', () => {
    // Regression: inside a transaction command:applied fires before the cursor advances, so reading
    // canUndo there is stale. The bridge must re-emit history:changed on transaction:committed.
    const h = harness(); const n = makeNode(); h.cmdBus.apply(new AddNode(n))
    h.record('history:changed')
    h.cmdBus.transaction(() => { h.cmdBus.apply(new MoveNode(n.id, { x: 5, y: 5 })) })
    expect(h.log.at(-1)).toEqual({ event: 'history:changed', payload: { canUndo: true, canRedo: false } })
  })

  it('re-emits history:changed when a transaction reverts', () => {
    const h = harness()
    h.record('history:changed')
    expect(() => h.cmdBus.transaction(() => { throw new Error('boom') })).toThrow()
    expect(h.log.at(-1)).toEqual({ event: 'history:changed', payload: { canUndo: false, canRedo: false } })
  })

  it('reports the correct stack state on redo (canRedo false once fully redone)', () => {
    // Regression: redo() advanced its cursor AFTER emitting command:redone, so history read a stale
    // canRedo (still true) — leaving the Redo button enabled with nothing left to redo.
    const h = harness(); const n = makeNode()
    h.cmdBus.apply(new AddNode(n)); h.cmdBus.undo()
    h.record('history:changed')
    h.cmdBus.redo()
    expect(h.log.at(-1)).toEqual({ event: 'history:changed', payload: { canUndo: true, canRedo: false } })
  })

  it('stops emitting after the returned unsubscribe is called', () => {
    const h = harness(); h.record('node:added'); h.off()
    h.cmdBus.apply(new AddNode(makeNode()))
    expect(h.log).toEqual([])
  })
})
