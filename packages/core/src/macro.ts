import { createNodeId } from './ids.js'
import type { Edge, Node, Pin, Vec2 } from './graph.js'
import type { NodeId, PinId, EdgeId } from './ids.js'

/** Reserved node type for a macro — a group of nodes that collapses into a single compact node and
 *  expands back in place (inline, no drill-in subgraph). The graph stays flat: members live in the
 *  graph and are hidden while collapsed. `state.members` holds the member ids, `state.collapsed`
 *  the fold state. Boundary-crossing edges become the macro's proxy pins (see boundaryEdges). */
export const MACRO_TYPE = 'Macro'

export function isMacro(node: { type: string }): boolean {
  return node.type === MACRO_TYPE
}

/** Mint a collapsed macro node carrying its member ids. Pins are derived from boundary edges by the
 *  editor on collapse, so a fresh macro starts pinless. */
export function createMacro(position: Vec2, members: NodeId[]): Node {
  return {
    id: createNodeId(),
    type: MACRO_TYPE,
    position,
    state: { members: [...members], collapsed: true },
    pins: [],
  }
}

/** Member ids of a macro node (empty for a non-macro or one with no members). */
export function macroMembers(node: Node): NodeId[] {
  if (!isMacro(node)) return []
  const m = node.state['members']
  return Array.isArray(m) ? (m as NodeId[]) : []
}

export interface MacroBoundary {
  /** Edges entering the group (from outside → a member): become the macro's input pins. */
  inputs: Edge[]
  /** Edges leaving the group (a member → outside): become the macro's output pins. */
  outputs: Edge[]
  /** Edges fully inside the group: hidden while collapsed, restored on expand. */
  internal: Edge[]
}

export interface MacroProxyPin {
  direction: 'in' | 'out'
  /** The member node this proxy stands in for. */
  memberNode: NodeId
  /** The member's own pin the boundary edges cross at. */
  memberPin: PinId
  /** Boundary edges routed through this proxy (an in-pin may gather several feeds; an out-pin may
   *  fan out to several externals). */
  edges: EdgeId[]
}

/** Collapse boundary edges into the macro's proxy pins: one input pin per distinct member IN-pin that
 *  receives an external feed, one output pin per distinct member OUT-pin that drives an external. Pin
 *  insertion order follows first appearance, so collapse is deterministic. */
export function macroProxyPins(boundary: MacroBoundary): MacroProxyPin[] {
  const order: MacroProxyPin[] = []
  const byKey = new Map<string, MacroProxyPin>()
  const add = (direction: 'in' | 'out', node: NodeId, pin: PinId, edge: EdgeId): void => {
    const key = `${direction}:${node}:${pin}`
    let proxy = byKey.get(key)
    if (!proxy) { proxy = { direction, memberNode: node, memberPin: pin, edges: [] }; byKey.set(key, proxy); order.push(proxy) }
    proxy.edges.push(edge)
  }
  for (const e of boundary.inputs) add('in', e.to.node, e.to.pin, e.id)
  for (const e of boundary.outputs) add('out', e.from.node, e.from.pin, e.id)
  return order
}

/** One restored-on-expand record per macro proxy edge: which fresh macro edge stands in for which
 *  original external↔member connection. Stored on the macro's state so expand can rebuild exactly. */
export interface MacroProxyRecord {
  /** Id of the macro proxy edge (external↔macro) created on collapse. */
  edgeId: EdgeId
  /** The macro's own proxy pin this crossing uses — fixed for the macro's lifetime, so collapse and
   *  expand just re-point the edge between this pin and the member pin without re-deriving pins. */
  macroPin: PinId
  direction: 'in' | 'out'
  externalNode: NodeId
  externalPin: PinId
  memberNode: NodeId
  memberPin: PinId
}

export interface Minters {
  pin: () => PinId
  edge: () => EdgeId
}

export interface MacroCollapsePlan {
  /** Proxy pins to give the macro node. */
  pins: Pin[]
  /** Boundary edges to remove (rewired onto the macro). */
  disconnect: EdgeId[]
  /** New external↔macro edges. */
  connect: Edge[]
  /** Restore map → macro.state for expand. */
  proxyMap: MacroProxyRecord[]
}

/** Plan a collapse: derive proxy pins from boundary crossings and rewire each boundary edge onto the
 *  macro (external↔member becomes external↔macro.proxyPin). Pure — the caller applies it through the
 *  command bus and persists `proxyMap` on the macro. `typeOf` resolves a member pin's wire type so
 *  the proxy pin carries it; `mint` supplies fresh pin/edge ids. */
export function planMacroCollapse(
  macroId: NodeId,
  members: NodeId[],
  edges: ReadonlyArray<Edge>,
  pinInfo: (node: NodeId, pin: PinId) => { type: string; label?: string },
  mint: Minters,
): MacroCollapsePlan {
  const boundary = boundaryEdges(new Set(members), edges)
  const proxies = macroProxyPins(boundary)
  const byId = new Map(edges.map((e) => [e.id, e]))
  const pins: Pin[] = []
  const connect: Edge[] = []
  const disconnect: EdgeId[] = []
  const proxyMap: MacroProxyRecord[] = []
  for (const proxy of proxies) {
    const pinId = mint.pin()
    const info = pinInfo(proxy.memberNode, proxy.memberPin)
    pins.push({
      id: pinId,
      kind: 'data',
      direction: proxy.direction,
      type: info.type,
      multiple: proxy.direction === 'out',
      ...(info.label !== undefined ? { label: info.label } : {}),
    })
    for (const beId of proxy.edges) {
      const orig = byId.get(beId)!
      disconnect.push(beId)
      const newId = mint.edge()
      // input: external.out → macro.in ;  output: macro.out → external.in
      const external = proxy.direction === 'in' ? orig.from : orig.to
      const newEdge: Edge = proxy.direction === 'in'
        ? { id: newId, from: { ...external }, to: { node: macroId, pin: pinId } }
        : { id: newId, from: { node: macroId, pin: pinId }, to: { ...external } }
      connect.push(newEdge)
      proxyMap.push({
        edgeId: newId,
        macroPin: pinId,
        direction: proxy.direction,
        externalNode: external.node,
        externalPin: external.pin,
        memberNode: proxy.memberNode,
        memberPin: proxy.memberPin,
      })
    }
  }
  return { pins, disconnect, connect, proxyMap }
}

export interface MacroExpandPlan {
  /** Macro proxy edges to remove. */
  disconnect: EdgeId[]
  /** Original external↔member edges to restore (fresh ids). */
  connect: Edge[]
}

/** Plan an expand: drop every macro proxy edge and rebuild the original external↔member edges from
 *  the stored proxy map. Pure — caller applies it and strips the macro's proxy pins. */
export function planMacroExpand(proxyMap: ReadonlyArray<MacroProxyRecord>, mint: Minters): MacroExpandPlan {
  const disconnect: EdgeId[] = []
  const connect: Edge[] = []
  for (const r of proxyMap) {
    disconnect.push(r.edgeId)
    const ext = { node: r.externalNode, pin: r.externalPin }
    const mem = { node: r.memberNode, pin: r.memberPin }
    connect.push(r.direction === 'in'
      ? { id: mint.edge(), from: ext, to: mem }
      : { id: mint.edge(), from: mem, to: ext })
  }
  return { disconnect, connect }
}

/** Partition edges relative to a member set — the heart of macro pin-proxying. An edge with exactly
 *  one endpoint inside the group crosses the boundary (input if it enters, output if it leaves); both
 *  inside is internal; both outside is ignored. Order within each bucket follows input order. */
export function boundaryEdges(members: ReadonlySet<NodeId>, edges: ReadonlyArray<Edge>): MacroBoundary {
  const inputs: Edge[] = []
  const outputs: Edge[] = []
  const internal: Edge[] = []
  for (const e of edges) {
    const fromIn = members.has(e.from.node)
    const toIn = members.has(e.to.node)
    if (fromIn && toIn) internal.push(e)
    else if (toIn) inputs.push(e)
    else if (fromIn) outputs.push(e)
  }
  return { inputs, outputs, internal }
}
