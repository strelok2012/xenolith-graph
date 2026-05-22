import type { Node, PinId } from '@xenolith/core'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface PinLayout {
  id: PinId
  x: number
  y: number
  side: 'left' | 'right'
}

export interface NodeLayout {
  body: Rect
  header: Rect
  pins: PinLayout[]
}

export interface LayoutTokens {
  node: {
    minWidth: number
    headerHeight: number
    headerPadding: number
    innerPaddingX: number
    innerPaddingY: number
  }
  pin: {
    diameter: number
    rowSpacing: number
    rowHeight: number
  }
  header: {
    toPinsGap: number
  }
}

export function computeNodeLayout(node: Node, tokens: LayoutTokens): NodeLayout {
  const width = node.size?.x ?? tokens.node.minWidth
  const height = node.size?.y ?? tokens.node.headerHeight + tokens.header.toPinsGap

  const body: Rect = {
    x: node.position.x,
    y: node.position.y,
    width,
    height,
  }

  const header: Rect = {
    x: node.position.x,
    y: node.position.y,
    width,
    height: tokens.node.headerHeight,
  }

  const firstRowCenterY =
    tokens.node.headerHeight + tokens.header.toPinsGap + tokens.pin.rowHeight / 2
  const rowStride = tokens.pin.rowSpacing + tokens.pin.rowHeight

  let inIndex = 0
  let outIndex = 0
  const pins: PinLayout[] = []
  for (const p of node.pins) {
    const side: 'left' | 'right' = p.direction === 'in' ? 'left' : 'right'
    const index = p.direction === 'in' ? inIndex++ : outIndex++
    const x = side === 'left' ? node.position.x : node.position.x + width
    const y = node.position.y + firstRowCenterY + rowStride * index
    pins.push({ id: p.id, x, y, side })
  }

  return { body, header, pins }
}
