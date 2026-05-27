import type { Vec2 } from './graph.js'
import type { NodeId } from './ids.js'

/** Minimal node shape needed for containment (avoids importing the full Node). */
export interface PlacedNode {
  id: NodeId
  position: Vec2
  size?: Vec2
}

export interface CommentRect {
  position: Vec2
  size: Vec2
}

/**
 * Ids of nodes spatially inside a comment frame — membership is by geometry, not an explicit list
 * (like React Flow groups). A node counts as inside when its CENTRE falls within the frame rect, so
 * dragging the frame captures exactly the nodes visually sitting on it. A node with no size is
 * treated as a point at its position.
 */
export function nodesInsideComment(comment: CommentRect, nodes: Iterable<PlacedNode>): NodeId[] {
  const x0 = comment.position.x
  const y0 = comment.position.y
  const x1 = x0 + comment.size.x
  const y1 = y0 + comment.size.y
  const inside: NodeId[] = []
  for (const n of nodes) {
    const cx = n.position.x + (n.size ? n.size.x / 2 : 0)
    const cy = n.position.y + (n.size ? n.size.y / 2 : 0)
    if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) inside.push(n.id)
  }
  return inside
}
