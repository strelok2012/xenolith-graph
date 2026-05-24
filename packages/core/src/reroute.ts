import { createNodeId, createPinId } from './ids.js'
import type { Node, Vec2 } from './graph.js'
import type { NodeSchema } from './node-registry.js'

/** Reserved node type for reroute knots — a first-class passthrough that carries a wire across the
 *  canvas without a header or body. Themes render it as a small dot/circle. ComfyUI's `Reroute`
 *  maps onto this. */
export const REROUTE_TYPE = '$reroute'

export function isReroute(node: { type: string }): boolean {
  return node.type === REROUTE_TYPE
}

/** Mint a reroute node: one `in` pin and one `out` pin of the same passthrough type. The type only
 *  drives wire colouring — reroutes accept anything. */
export function createReroute(position: Vec2, opts: { type?: string } = {}): Node {
  const type = opts.type ?? 'any'
  return {
    id: createNodeId(),
    type: REROUTE_TYPE,
    position,
    state: {},
    pins: [
      { id: createPinId(), kind: 'data', direction: 'in',  type, multiple: false },
      { id: createPinId(), kind: 'data', direction: 'out', type, multiple: true },
    ],
  }
}

/** Palette-facing reroute: a normal rectangular node (standard renderer, visible In/Out pins) that
 *  users can wire freely and pull new connections from — distinct from the inline `$reroute` dot,
 *  which is created by splitting an edge and cannot be pulled from. Auto-registered by the editor
 *  so it appears in every insert palette. */
export const REROUTE_NODE_TYPE = 'Reroute'

export const rerouteNodeSchema: NodeSchema = {
  type: REROUTE_NODE_TYPE,
  title: 'Reroute',
  category: 'utility',
  description: 'Relay a wire through a movable node',
  keywords: ['reroute', 'relay', 'pass', 'through', 'knot', 'pipe'],
  pins: [
    { kind: 'data', direction: 'in',  type: 'any' },
    { kind: 'data', direction: 'out', type: 'any', multiple: true },
  ],
}
