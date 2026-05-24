import type { Node, Pin, PinId } from '@xenolith/core'

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

interface HeightTokens {
  node: { headerHeight: number }
  pin: { rowSpacing: number; rowHeight: number }
  header: { toPinsGap: number }
}

/** Body height that fits the header plus every pin row, used when a node carries no explicit
 *  size (palette-inserted / imported nodes). Rows = max(inputCount, outputCount). */
function naturalHeight(node: Node, tokens: HeightTokens): number {
  let inCount = 0, outCount = 0
  for (const p of node.pins) (p.direction === 'in' ? inCount++ : outCount++)
  const rows = Math.max(inCount, outCount)
  if (rows === 0) return tokens.node.headerHeight + tokens.header.toPinsGap
  const rowsHeight = rows * tokens.pin.rowHeight + (rows - 1) * tokens.pin.rowSpacing
  // Bottom padding mirrors the header→pins gap so the pin block sits visually centred in the
  // body rather than crammed against the bottom edge.
  return tokens.node.headerHeight + tokens.header.toPinsGap + rowsHeight + tokens.header.toPinsGap
}

/** Measures a single line of text in CSS pixels. The editor binds this to PIXI's
 *  `CanvasTextMetrics`; unit tests inject a deterministic fake. */
export type TextMeasurer = (text: string, fontSize: number, fontWeight: number) => number

export interface NodeSizeTokens {
  node: { minWidth: number; headerHeight: number; headerPadding: number }
  pin: { diameter: number; rowSpacing: number; rowHeight: number; labelGap: number }
  header: { toPinsGap: number; chevronSize: number; titleGap: number }
  typography: { titleSize: number; titleWeight: number; labelSize: number; labelWeight: number }
}

/** Gap kept between an input label's right edge and the opposite output label's left edge so the
 *  two columns never touch. */
const LABEL_COLUMN_GUTTER = 14

/** Natural body width that fits the header title and every input/output label pair without
 *  overlap. Mirrors the exact placement geometry in `renderNode` (title inset, pin label
 *  insets) so the measured width matches what is actually drawn. */
function naturalWidth(
  node: Node, title: string, tokens: NodeSizeTokens, measure: TextMeasurer,
): number {
  // Title region: chevron sits at the left, title starts just past it. Keep the same trailing
  // padding on the right as the chevron's left inset for visual symmetry.
  const chevronCenterX = tokens.node.headerPadding + 8 + tokens.header.chevronSize / 2 - 4
  const titleX = chevronCenterX + tokens.header.chevronSize / 2 + tokens.header.titleGap
  const titleW = measure(title, tokens.typography.titleSize, tokens.typography.titleWeight)
  const titleNeed = titleX + titleW + tokens.node.headerPadding + 6

  // Pin labels are inset from each edge by (pin radius + labelGap). An input on row i shares the
  // row with output i; their labels must not collide.
  const sidePad = tokens.pin.diameter / 2 + tokens.pin.labelGap
  const inputs = node.pins.filter((p) => p.direction === 'in')
  const outputs = node.pins.filter((p) => p.direction === 'out')
  const labelW = (p: Pin | undefined): number =>
    p?.label ? measure(p.label, tokens.typography.labelSize, tokens.typography.labelWeight) : 0

  let rowNeed = 0
  const rows = Math.max(inputs.length, outputs.length)
  for (let i = 0; i < rows; i++) {
    const inW = labelW(inputs[i])
    const outW = labelW(outputs[i])
    const gutter = inW > 0 && outW > 0 ? LABEL_COLUMN_GUTTER : 0
    rowNeed = Math.max(rowNeed, sidePad + inW + gutter + outW + sidePad)
  }

  return Math.max(tokens.node.minWidth, Math.ceil(titleNeed), Math.ceil(rowNeed))
}

/** Resolved render size for a node lacking an explicit `size`. Single source of truth: the editor
 *  backfills `node.size` with this so renderer, geom bounds, edge endpoints and the backdrop all
 *  agree on dimensions. */
export function measureNodeSize(
  node: Node, title: string, tokens: NodeSizeTokens, measure: TextMeasurer,
): { x: number; y: number } {
  return {
    x: naturalWidth(node, title, tokens, measure),
    y: naturalHeight(node, tokens),
  }
}

export function computeNodeLayout(node: Node, tokens: LayoutTokens): NodeLayout {
  const width = node.size?.x ?? tokens.node.minWidth
  const height = node.size?.y ?? naturalHeight(node, tokens)

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
