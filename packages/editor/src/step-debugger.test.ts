import { describe, it, expect, vi } from 'vitest'
import { Graph, createNodeId, createEdgeId, createPinId } from '@xenolith/core'
import type { Node, Edge, NodeId } from '@xenolith/core'
import { StepDebugger, type StepExecutor } from './step-debugger.js'

// Tiny math graph: const(2) → add ← const(3); the executor reads node.state.value or sums inputs.
function mathGraph(): { g: Graph; a: Node; b: Node; sum: Node } {
  const mkConst = (v: number): Node => {
    const out = createPinId()
    return { id: createNodeId(), type: 'Const', position: { x: 0, y: 0 }, state: { value: v },
      pins: [{ id: out, kind: 'data', direction: 'out', type: 'number', multiple: false }] }
  }
  const inP = createPinId(), inQ = createPinId(), outR = createPinId()
  const a = mkConst(2), b = mkConst(3)
  const sum: Node = { id: createNodeId(), type: 'Add', position: { x: 0, y: 0 }, state: {},
    pins: [
      { id: inP, kind: 'data', direction: 'in', type: 'number', multiple: false, label: 'a' },
      { id: inQ, kind: 'data', direction: 'in', type: 'number', multiple: false, label: 'b' },
      { id: outR, kind: 'data', direction: 'out', type: 'number', multiple: false, label: 'sum' },
    ] }
  const g = new Graph()
  for (const n of [a, b, sum]) g._addNode(n)
  const eA: Edge = { id: createEdgeId(), from: { node: a.id, pin: a.pins[0]!.id }, to: { node: sum.id, pin: inP } }
  const eB: Edge = { id: createEdgeId(), from: { node: b.id, pin: b.pins[0]!.id }, to: { node: sum.id, pin: inQ } }
  g._addEdge(eA); g._addEdge(eB)
  return { g, a, b, sum }
}

const executor: StepExecutor = ({ node, inputs }) => {
  if (node.type === 'Const') return new Map([[node.pins[0]!.id, (node.state as { value: number }).value]])
  if (node.type === 'Add') {
    const sum = [...inputs.values()].reduce<number>((s, v) => s + Number(v), 0)
    return new Map([[node.pins.find((p) => p.direction === 'out')!.id, sum]])
  }
  return new Map()
}

describe('StepDebugger', () => {
  it('starts in idle, pauses on first node after start()', async () => {
    const { g } = mathGraph()
    const d = new StepDebugger(g, executor)
    expect(d.status).toBe('idle')
    await d.start()
    expect(d.status).toBe('paused')
    expect(d.currentNodeId).toBeTruthy()
  })

  it('step() executes current node, advances, fires stepped/paused', async () => {
    const { g } = mathGraph()
    const d = new StepDebugger(g, executor)
    const events: string[] = []
    d.on('stepped', (r) => events.push(`stepped:${r.type}`))
    d.on('paused', ({ node }) => events.push(`paused:${node.type}`))
    await d.start()
    await d.step()
    expect(events[0]).toBe('paused:Const')
    expect(events[1]).toBe('stepped:Const')
    expect(events[2]).toMatch(/^paused:/)
  })

  it('continue() runs to end and fires finished with full history', async () => {
    const { g } = mathGraph()
    const d = new StepDebugger(g, executor)
    const finished = vi.fn()
    d.on('finished', finished)
    await d.start()
    await d.continue()
    expect(d.status).toBe('finished')
    expect(finished).toHaveBeenCalledTimes(1)
    expect(d.history).toHaveLength(3)
    const sumRecord = d.history[2]!
    expect([...sumRecord.outputs.values()]).toEqual([5])
  })

  it('breakpoint pauses continue() BEFORE the breakpointed node executes', async () => {
    const { g, sum } = mathGraph()
    const d = new StepDebugger(g, executor)
    d.setBreakpoint(sum.id)
    await d.start()
    await d.continue()
    expect(d.status).toBe('paused')
    expect(d.currentNodeId).toBe(sum.id)
    expect(d.history.find((r) => r.nodeId === sum.id)).toBeUndefined() // not yet executed
  })

  it('continue() after breakpoint resumes and finishes', async () => {
    const { g, sum } = mathGraph()
    const d = new StepDebugger(g, executor)
    d.setBreakpoint(sum.id)
    await d.start()
    await d.continue()
    await d.continue()
    expect(d.status).toBe('finished')
    expect(d.history.find((r) => r.nodeId === sum.id)).toBeTruthy()
  })

  it('toggleBreakpoint flips the set and returns new state', () => {
    const { g, sum } = mathGraph()
    const d = new StepDebugger(g, executor)
    expect(d.toggleBreakpoint(sum.id)).toBe(true)
    expect(d.breakpoints.has(sum.id)).toBe(true)
    expect(d.toggleBreakpoint(sum.id)).toBe(false)
    expect(d.breakpoints.has(sum.id)).toBe(false)
  })

  it('thrown executor surfaces error event and stops', async () => {
    const { g } = mathGraph()
    const d = new StepDebugger(g, () => { throw new Error('boom') })
    const errs: string[] = []
    d.on('error', (e) => errs.push(e.message))
    await d.start()
    await d.step()
    expect(d.status).toBe('error')
    expect(errs).toEqual(['boom'])
  })

  it('step() collects inputs from upstream node outputs', async () => {
    const { g, sum } = mathGraph()
    const d = new StepDebugger(g, executor)
    let observed: Map<string, unknown> | null = null
    d.on('paused', ({ nodeId, inputs }) => { if (nodeId === sum.id) observed = inputs })
    await d.start()
    // Step past both consts; pause on Add — inputs should be {pin_a:2, pin_b:3}
    await d.step()
    await d.step()
    expect(observed).not.toBeNull()
    expect([...observed!.values()].sort()).toEqual([2, 3])
  })

  it('skips members of a collapsed macro; macro itself is the step unit', async () => {
    // Build: a → macro(collapsed){m1, m2} → b
    const a: Node = { id: createNodeId(), type: 'Const', position: { x: 0, y: 0 }, state: { value: 7 },
      pins: [{ id: createPinId(), kind: 'data', direction: 'out', type: 'number', multiple: false }] }
    const m1: Node = { id: createNodeId(), type: 'Internal', position: { x: 0, y: 0 }, state: {}, pins: [] }
    const m2: Node = { id: createNodeId(), type: 'Internal', position: { x: 0, y: 0 }, state: {}, pins: [] }
    const macroIn = createPinId(), macroOut = createPinId()
    const macro: Node = { id: createNodeId(), type: 'Macro', position: { x: 0, y: 0 },
      state: { collapsed: true, members: [m1.id, m2.id] },
      pins: [
        { id: macroIn,  kind: 'data', direction: 'in',  type: 'number', multiple: false },
        { id: macroOut, kind: 'data', direction: 'out', type: 'number', multiple: false },
      ] }
    const b: Node = { id: createNodeId(), type: 'Sink', position: { x: 0, y: 0 }, state: {},
      pins: [{ id: createPinId(), kind: 'data', direction: 'in', type: 'number', multiple: false }] }
    const g = new Graph()
    for (const n of [a, m1, m2, macro, b]) g._addNode(n)
    g._addEdge({ id: createEdgeId(), from: { node: a.id, pin: a.pins[0]!.id }, to: { node: macro.id, pin: macroIn } })
    g._addEdge({ id: createEdgeId(), from: { node: macro.id, pin: macroOut }, to: { node: b.id, pin: b.pins[0]!.id } })

    const exec: StepExecutor = ({ node, inputs }) => {
      if (node.type === 'Const') return new Map([[node.pins[0]!.id, (node.state as { value: number }).value]])
      if (node.type === 'Macro') return new Map([[macroOut, ([...inputs.values()][0] as number) * 10]])
      if (node.type === 'Sink') return new Map()
      throw new Error('member executed — should be skipped')
    }
    const d = new StepDebugger(g, exec)
    await d.start()
    await d.continue()
    expect(d.status).toBe('finished')
    expect(d.history.map((r) => r.type)).toEqual(['Const', 'Macro', 'Sink'])
    expect([...d.history[1]!.outputs.values()]).toEqual([70]) // 7 * 10
  })

  it('expanded macro is skipped from trace — its visible members are the steps', async () => {
    // Expanded macro has no data flow (its proxy pins carry nothing — external edges go to
    // members directly). Including it in the trace would mean a "pause on nothing" so we skip.
    const m1Out = createPinId(), bIn = createPinId()
    const m1: Node = { id: createNodeId(), type: 'Const', position: { x: 0, y: 0 }, state: { value: 3 },
      pins: [{ id: m1Out, kind: 'data', direction: 'out', type: 'number', multiple: false }] }
    const macro: Node = { id: createNodeId(), type: 'Macro', position: { x: 0, y: 0 },
      state: { collapsed: false, members: [m1.id] }, pins: [] }
    const b: Node = { id: createNodeId(), type: 'Sink', position: { x: 0, y: 0 }, state: {},
      pins: [{ id: bIn, kind: 'data', direction: 'in', type: 'number', multiple: false }] }
    const g = new Graph()
    for (const n of [macro, m1, b]) g._addNode(n)
    g._addEdge({ id: createEdgeId(), from: { node: m1.id, pin: m1Out }, to: { node: b.id, pin: bIn } })
    const exec: StepExecutor = ({ node }) => {
      if (node.type === 'Macro') throw new Error('expanded macro should not execute')
      if (node.type === 'Const') return new Map([[m1Out, 3]])
      return new Map()
    }
    const d = new StepDebugger(g, exec)
    await d.start()
    await d.continue()
    expect(d.status).toBe('finished')
    expect(d.history.map((r) => r.type)).toEqual(['Const', 'Sink'])
  })

  it('advance() skips the current node without executing it', async () => {
    const { g } = mathGraph()
    const d = new StepDebugger(g, executor)
    await d.start()
    const firstId = d.currentNodeId
    expect(firstId).toBeTruthy()
    d.advance()
    expect(d.currentNodeId).not.toBe(firstId)
    expect(d.history).toHaveLength(0) // nothing executed
  })

  it('advance() through the whole order transitions to finished', async () => {
    const { g } = mathGraph()
    const d = new StepDebugger(g, executor)
    await d.start()
    while (d.status === 'paused') d.advance()
    expect(d.status).toBe('finished')
    expect(d.history).toHaveLength(0)
  })

  it('stop() resets to idle and clears state', async () => {
    const { g } = mathGraph()
    const d = new StepDebugger(g, executor)
    await d.start()
    await d.step()
    d.stop()
    expect(d.status).toBe('idle')
    expect(d.history).toHaveLength(0)
    expect(d.currentNodeId).toBeNull()
  })
})
