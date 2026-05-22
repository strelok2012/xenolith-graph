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
