import type { Node } from '@xenolith/core'

export interface Vec2 {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export function rectFromPoints(a: Vec2, b: Vec2): Rect {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  }
}

/** Strict AABB intersection — touching edges (zero overlap) do not count. */
export function rectIntersects(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

export interface NodeBoundsTokens {
  geometry: {
    node: { minWidth: number; headerHeight: number; headerPadding: number }
    header: { toPinsGap: number }
  }
}

/**
 * For each node, compute the set of lower-paint-order nodes whose AABB overlaps it.
 *
 * Used by backdrop-sampling themes (Liquid Glass) to do painter's-order RT compositing:
 * a node with non-empty `lower` entry needs its own RT with those lower nodes baked in, so
 * its glass shader refracts what's visually underneath it. Nodes with empty `lower` share the
 * single base backdrop (cheaper path).
 *
 * Input `rects` are ordered bottom-to-top in paint order (index 0 = bottom of stack).
 */
export function computeOverlapBackdropPlan(
  rects: ReadonlyArray<{ id: string; x: number; y: number; width: number; height: number }>,
): Map<string, string[]> {
  const plan = new Map<string, string[]>()
  for (let i = 1; i < rects.length; i++) {
    const ri = rects[i]!
    const lower: string[] = []
    for (let j = 0; j < i; j++) {
      const rj = rects[j]!
      if (rectIntersects(ri, rj)) lower.push(rj.id)
    }
    if (lower.length > 0) plan.set(ri.id, lower)
  }
  return plan
}

/** World-space AABB of a node — used for marquee-selection hit-testing. */
export function nodeBounds(node: Node, tokens: NodeBoundsTokens): Rect {
  const width = node.size?.x ?? tokens.geometry.node.minWidth
  const height =
    node.size?.y ?? tokens.geometry.node.headerHeight + tokens.geometry.header.toPinsGap
  return {
    x: node.position.x,
    y: node.position.y,
    width,
    height,
  }
}
