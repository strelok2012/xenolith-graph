import type { Node, Pin, PinId, WidgetSpec } from '@xenolith/core'

export interface WidgetGeometry {
  rowHeight: number
  gap: number
  /** Min width reserved for a widget's control (slider track, value field) beside its label. */
  controlMinWidth: number
}

/** Vertical space one widget occupies — multiline text gets three rows; a custom widget uses its
 *  declared height (default 4 rows). Must match `widget-renderer`'s copy so size matches render. */
function widgetRowHeight(w: WidgetSpec, geo: WidgetGeometry): number {
  // Labelled text puts its label on a row ABOVE the field box, so it needs an extra row.
  if (w.type === 'text') {
    const field = w.multiline ? geo.rowHeight * 3 : geo.rowHeight
    return w.label ? field + geo.rowHeight : field
  }
  if (w.type === 'custom') return w.height ?? geo.rowHeight * 4
  return geo.rowHeight
}

/** Height of the widget block appended below the pin rows: a leading gap, each widget row, and a
 *  gap between rows. Zero when the node has no widgets. */
function widgetsHeight(node: Node, geo: WidgetGeometry | undefined): number {
  if (!geo || !node.widgets || node.widgets.length === 0) return 0
  const rows = node.widgets.reduce((sum, w) => sum + widgetRowHeight(w, geo), 0)
  return geo.gap + rows + geo.gap * (node.widgets.length - 1)
}

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
  widget?: WidgetGeometry
}

interface HeightTokens {
  node: { headerHeight: number }
  pin: { rowSpacing: number; rowHeight: number }
  header: { toPinsGap: number }
  widget?: WidgetGeometry
}

/** Partition pins into the UE-Blueprint sections: exec pins occupy a row band at the TOP (exec-in
 *  left, exec-out right), data pins fill rows below — regardless of declaration order. */
function sectionPins(pins: ReadonlyArray<Pin>): { execIn: Pin[]; execOut: Pin[]; dataIn: Pin[]; dataOut: Pin[] } {
  const execIn: Pin[] = [], execOut: Pin[] = [], dataIn: Pin[] = [], dataOut: Pin[] = []
  for (const p of pins) {
    if (p.kind === 'exec') (p.direction === 'in' ? execIn : execOut).push(p)
    else (p.direction === 'in' ? dataIn : dataOut).push(p)
  }
  return { execIn, execOut, dataIn, dataOut }
}

/** A single, label-less exec pin on a side is HOISTED onto the header line (UE: exec-in top-left,
 *  exec-out top-right). Multiple exec-outs (Branch/Sequence) or a labelled exec stay in the body band. */
function hoisted(execIn: ReadonlyArray<Pin>, execOut: ReadonlyArray<Pin>): { hoistIn: boolean; hoistOut: boolean } {
  return {
    hoistIn: execIn.length === 1 && !execIn[0]!.label,
    hoistOut: execOut.length === 1 && !execOut[0]!.label,
  }
}

/** Body pin rows: the exec band (only NON-hoisted exec pins) plus the data band. Hoisted exec pins
 *  ride the header line and don't take a body row. */
export function pinRowCount(pins: ReadonlyArray<Pin>): number {
  const { execIn, execOut, dataIn, dataOut } = sectionPins(pins)
  const { hoistIn, hoistOut } = hoisted(execIn, execOut)
  const bodyExecRows = Math.max(hoistIn ? 0 : execIn.length, hoistOut ? 0 : execOut.length)
  return bodyExecRows + Math.max(dataIn.length, dataOut.length)
}

/** Body height that fits the header, every pin row, and the widget block, used when a node carries
 *  no explicit size (palette-inserted / imported nodes). Exec rows sit above data rows (UE layout). */
function naturalHeight(node: Node, tokens: HeightTokens): number {
  const rows = pinRowCount(node.pins)
  const widgets = widgetsHeight(node, tokens.widget)
  if (rows === 0 && widgets === 0) return tokens.node.headerHeight + tokens.header.toPinsGap
  const rowsHeight = rows > 0 ? rows * tokens.pin.rowHeight + (rows - 1) * tokens.pin.rowSpacing : 0
  // Bottom padding mirrors the header→pins gap so the content sits visually centred in the body
  // rather than crammed against the bottom edge.
  return tokens.node.headerHeight + tokens.header.toPinsGap + rowsHeight + widgets + tokens.header.toPinsGap
}

/** Measures a single line of text in CSS pixels. The editor binds this to PIXI's
 *  `CanvasTextMetrics`; unit tests inject a deterministic fake. */
export type TextMeasurer = (text: string, fontSize: number, fontWeight: number) => number

export interface NodeSizeTokens {
  node: { minWidth: number; headerHeight: number; headerPadding: number }
  pin: { diameter: number; rowSpacing: number; rowHeight: number; labelGap: number }
  header: { toPinsGap: number; chevronSize: number; titleGap: number }
  typography: { titleSize: number; titleWeight: number; labelSize: number; labelWeight: number }
  widget?: WidgetGeometry
}

/** Gap kept between an input label's right edge and the opposite output label's left edge so the
 *  two columns never touch. */
const LABEL_COLUMN_GUTTER = 14

/** Max width a header title may add to the node. Beyond this the renderer ellipsises the title rather
 *  than stretching the node — keeps a pathological rename from producing a giant node. */
const TITLE_MAX_WIDTH = 220

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
  // Cap the title's pull on width: short titles size the node fully, but a very long title is
  // ellipsised by the renderer instead of stretching the node forever. Pin/widget rows still drive
  // width uncapped, so a long PIN label always fits.
  const titleW = Math.min(measure(title, tokens.typography.titleSize, tokens.typography.titleWeight), TITLE_MAX_WIDTH)
  const { execIn, execOut, dataIn, dataOut } = sectionPins(node.pins)
  const { hoistIn, hoistOut } = hoisted(execIn, execOut)
  // A hoisted exec-out sits at the header's right edge — reserve room so the title can't collide with it.
  const headerExecReserve = hoistOut ? tokens.pin.diameter + tokens.header.titleGap : 0
  const titleNeed = titleX + titleW + tokens.node.headerPadding + 6 + headerExecReserve

  // Pin labels are inset from each edge by (pin radius + labelGap). Rows pair an input with the output
  // on the same row; their labels must not collide. Only NON-hoisted exec pins sit in the body band;
  // a hoisted single exec rides the header line and doesn't constrain a body row.
  const sidePad = tokens.pin.diameter / 2 + tokens.pin.labelGap
  const labelW = (p: Pin | undefined): number =>
    p?.label ? measure(p.label, tokens.typography.labelSize, tokens.typography.labelWeight) : 0

  let rowNeed = 0
  const rowPair = (a: Pin | undefined, b: Pin | undefined): void => {
    const inW = labelW(a), outW = labelW(b)
    const gutter = inW > 0 && outW > 0 ? LABEL_COLUMN_GUTTER : 0
    rowNeed = Math.max(rowNeed, sidePad + inW + gutter + outW + sidePad)
  }
  const bodyExecIn = hoistIn ? [] : execIn
  const bodyExecOut = hoistOut ? [] : execOut
  for (let i = 0; i < Math.max(bodyExecIn.length, bodyExecOut.length); i++) rowPair(bodyExecIn[i], bodyExecOut[i])
  for (let j = 0; j < Math.max(dataIn.length, dataOut.length); j++) rowPair(dataIn[j], dataOut[j])

  // Each widget needs room for its label plus a control (slider track / value field) on the row.
  let widgetNeed = 0
  if (tokens.widget && node.widgets) {
    for (const w of node.widgets) {
      const lblW = measure(w.label, tokens.typography.labelSize, tokens.typography.labelWeight)
      widgetNeed = Math.max(widgetNeed, sidePad + lblW + LABEL_COLUMN_GUTTER + tokens.widget.controlMinWidth + sidePad)
    }
  }

  return Math.max(tokens.node.minWidth, Math.ceil(titleNeed), Math.ceil(rowNeed), Math.ceil(widgetNeed))
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
  const rowY = (rowIdx: number): number => node.position.y + firstRowCenterY + rowStride * rowIdx

  // UE-Blueprint placement. A single label-less exec pin is HOISTED onto the header line (exec-in at
  // the header's left edge, exec-out at the right, centred on the title). Otherwise exec pins form the
  // top body band (exec-in left / exec-out right), with data pins below — independent of declaration order.
  const { execIn, execOut, dataIn, dataOut } = sectionPins(node.pins)
  const { hoistIn, hoistOut } = hoisted(execIn, execOut)
  const headerY = node.position.y + tokens.node.headerHeight / 2
  const pins: PinLayout[] = []
  const place = (list: Pin[], side: 'left' | 'right', startRow: number): void => {
    const x = side === 'left' ? node.position.x : node.position.x + width
    list.forEach((p, i) => pins.push({ id: p.id, x, y: rowY(startRow + i), side }))
  }
  if (hoistIn) pins.push({ id: execIn[0]!.id, x: node.position.x, y: headerY, side: 'left' })
  if (hoistOut) pins.push({ id: execOut[0]!.id, x: node.position.x + width, y: headerY, side: 'right' })
  const bodyExecIn = hoistIn ? [] : execIn
  const bodyExecOut = hoistOut ? [] : execOut
  const bodyExecRows = Math.max(bodyExecIn.length, bodyExecOut.length)
  place(bodyExecIn, 'left', 0)
  place(bodyExecOut, 'right', 0)
  place(dataIn, 'left', bodyExecRows)
  place(dataOut, 'right', bodyExecRows)

  return { body, header, pins }
}
