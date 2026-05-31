import type { Node, Pin, PinId, WidgetSpec } from '@xenolith/core'
import { widgetBindKey, widgetVisibility, widgetIsVisible } from '@xenolith/core'

export interface WidgetGeometry {
  rowHeight: number
  gap: number
  /** Min width reserved for a widget's control (slider track, value field) beside its label. */
  controlMinWidth: number
}

/** Height of the actions row appended below the pin block: leading gap, button rows stacked with
 *  gaps between them. Returns 0 when there are no button widgets. Pin-bound widgets aren't here —
 *  they ride inside their pin row, not in a band. */
function actionsRowHeight(node: Node, geo: WidgetGeometry | undefined): number {
  if (!geo || !node.widgets || node.widgets.length === 0) return 0
  const buttons = node.widgets.filter((w) => w.type === 'button')
  if (buttons.length === 0) return 0
  return geo.gap + buttons.length * geo.rowHeight + geo.gap * (buttons.length - 1)
}

/** A widget is "free-floating" (rides in the body band, not a pin row) in two cases:
 *  1. `custom` widget whose declared bind key doesn't resolve to any pin — these are node-level
 *     editors (schema editor, color palette, multi-field panel) that legitimately don't belong
 *     to one specific pin.
 *  2. Any widget with explicit `freeFloating: true` — n8n-style config fields (HTTP body, auth
 *     token, etc.) that aren't connectable from outside but still need rendering. Bypasses the
 *     usual "non-custom widget needs a pin to render" rule.
 *  Standard non-custom widgets without a pin or the explicit flag are still silently dropped. */
export function isFreeFloating(node: Node, w: WidgetSpec): boolean {
  if (w.type === 'button') return false // buttons live in the actions row, not the body band
  if (w.freeFloating === true) return true
  if (w.type !== 'custom') return false
  const bind = widgetBindKey(w)
  if (bind === undefined) return false
  return findPinByKey(node, bind) === undefined
}

/** A pin is "hidden" when its bound widget evaluates `displayOptions.show=false` AND the pin has
 *  no incident edge. The edge clause prevents an active wire from dangling: once a pin is wired,
 *  hiding it would orphan the edge visually. Pins without a widget never hide. */
function pinIsHidden(node: Node, pin: Pin, isPinConnected?: (pinKey: string) => boolean): boolean {
  if (!node.widgets) return false
  // Find the widget bound to this pin (by label or id, mirroring widgetBindKey resolution).
  const w = node.widgets.find((ww) => {
    const bind = widgetBindKey(ww)
    return bind !== undefined && (bind === pin.label || bind === String(pin.id))
  })
  if (!w) return false
  if (widgetIsVisible(w, node)) return false
  const bind = widgetBindKey(w)
  if (bind === undefined) return true
  return !isPinConnected?.(bind)
}

/** Filter out pins whose widget is `displayOptions.show=false` and aren't wired — see `pinIsHidden`.
 *  Use this everywhere layout reads `node.pins` so a conditionally-hidden field collapses cleanly. */
function visiblePins(node: Node, isPinConnected?: (pinKey: string) => boolean): Pin[] {
  return node.pins.filter((p) => !pinIsHidden(node, p, isPinConnected))
}

/** Height of the body band reserved for free-floating widgets that are CURRENTLY visible: leading
 *  gap, each visible widget's declared height, gaps between. Zero when nothing is visible (so a
 *  node with conditional widgets shrinks back to compact when all of them are hidden). */
function freeWidgetsBandHeight(node: Node, geo: WidgetGeometry | undefined): number {
  if (!geo || !node.widgets || node.widgets.length === 0) return 0
  const free = node.widgets.filter((w) => isFreeFloating(node, w) && widgetIsVisible(w, node))
  if (free.length === 0) return 0
  let h = geo.gap
  for (let i = 0; i < free.length; i++) {
    const w = free[i]!
    h += (w.type === 'custom' ? (w.height ?? geo.rowHeight) : geo.rowHeight)
    if (i < free.length - 1) h += geo.gap
  }
  return h
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
export function sectionPins(pins: ReadonlyArray<Pin>): { execIn: Pin[]; execOut: Pin[]; dataIn: Pin[]; dataOut: Pin[] } {
  const execIn: Pin[] = [], execOut: Pin[] = [], dataIn: Pin[] = [], dataOut: Pin[] = []
  for (const p of pins) {
    if (p.kind === 'exec') (p.direction === 'in' ? execIn : execOut).push(p)
    else (p.direction === 'in' ? dataIn : dataOut).push(p)
  }
  return { execIn, execOut, dataIn, dataOut }
}

/** Exec pins always sit in the body band. (Earlier the renderer hoisted a lone exec onto the header
 *  line UE-style, but a node may have multiple exec-outs — e.g. Branch/Sequence — and the asymmetry
 *  between "hoisted when one, body when many" was confusing. Consistency wins.) */
function hoisted(_execIn: ReadonlyArray<Pin>, _execOut: ReadonlyArray<Pin>): { hoistIn: boolean; hoistOut: boolean } {
  return { hoistIn: false, hoistOut: false }
}

/** Body pin rows: the exec band (only NON-hoisted exec pins) plus the data band. Hoisted exec pins
 *  ride the header line and don't take a body row. */
export function pinRowCount(pins: ReadonlyArray<Pin>): number {
  const { execIn, execOut, dataIn, dataOut } = sectionPins(pins)
  const { hoistIn, hoistOut } = hoisted(execIn, execOut)
  const bodyExecRows = Math.max(hoistIn ? 0 : execIn.length, hoistOut ? 0 : execOut.length)
  return bodyExecRows + Math.max(dataIn.length, dataOut.length)
}

/** Effective height of each pin row — HYBRID rhythm:
 *  - All rows share a UNIFORM base = max(pin.rowHeight, widget.rowHeight if any standard bound
 *    widget is visible). Keeps the vertical rhythm consistent across the pin band so labels and
 *    standard controls align row-by-row.
 *  - A row whose visible bound widget is a CUSTOM widget with its own declared height (curve, XY
 *    pad, image preview…) grows ONLY that row to fit. Other rows stay at the base — so a single
 *    tall preview doesn't balloon the whole node into mostly-empty space.
 *  Drives `naturalHeight`, `computeNodeLayout`, and `computeWidgetRects`. */
export function pinRowHeights(
  node: Node,
  pinRowHeight: number,
  widgetRowHeight: number,
  isPinConnected?: (pinKey: string) => boolean,
): number[] {
  const rows = pinRowCount(visiblePins(node, isPinConnected))
  // Step 1 — uniform base. Bumped to widget.rowHeight when any standard pin-bound widget is visible.
  let base = pinRowHeight
  const perRow: (number | undefined)[] = new Array(rows).fill(undefined)
  if (node.widgets) {
    for (const w of node.widgets) {
      const bind = widgetBindKey(w)
      if (bind === undefined) continue // button — actions row
      if (!findPinByKey(node, bind)) continue // orphan
      const visible = (widgetVisibility(w) === 'always' || !(isPinConnected?.(bind))) && widgetIsVisible(w, node)
      if (!visible) continue
      const rowIdx = pinRowIndexFor(node, bind)
      if (rowIdx === undefined) continue
      if (w.type === 'custom' && w.height !== undefined) {
        // Per-row override for tall custom widgets.
        perRow[rowIdx] = Math.max(perRow[rowIdx] ?? 0, w.height)
      } else {
        // Standard widget — bumps the uniform base.
        if (widgetRowHeight > base) base = widgetRowHeight
      }
    }
  }
  const out: number[] = new Array(rows)
  for (let i = 0; i < rows; i++) out[i] = Math.max(base, perRow[i] ?? 0)
  return out
}

/** Sum of all pin row heights + the spacings between them. */
export function pinBandHeight(rowHeights: ReadonlyArray<number>, rowSpacing: number): number {
  if (rowHeights.length === 0) return 0
  let h = 0
  for (const r of rowHeights) h += r
  return h + (rowHeights.length - 1) * rowSpacing
}

/** Y of a pin row's centre relative to the node's TOP edge (i.e. local-space y). */
export function pinRowCenterY(
  rowHeights: ReadonlyArray<number>, rowIdx: number,
  rowSpacing: number, headerHeight: number, headerToPinsGap: number,
): number {
  let y = headerHeight + headerToPinsGap
  for (let i = 0; i < rowIdx; i++) y += rowHeights[i]! + rowSpacing
  return y + rowHeights[rowIdx]! / 2
}

/** Per-node uniform effective row height — backward-compat shim. Equals the max of per-row
 *  heights. New code should call `pinRowHeights` for accuracy. */
export function effectivePinRowHeight(
  node: Node,
  pinRowHeight: number,
  widgetRowHeight: number,
  isPinConnected?: (pinKey: string) => boolean,
): number {
  const heights = pinRowHeights(node, pinRowHeight, widgetRowHeight, isPinConnected)
  let max = pinRowHeight
  for (const r of heights) if (r > max) max = r
  return max
}

/** Match a pinKey against a pin: by label first (schema authors can't predict auto-minted ids),
 *  then by id (loaded graphs may bind by serialized id). */
function pinMatches(pin: Pin, pinKey: string): boolean {
  return pin.label === pinKey || String(pin.id) === pinKey
}

/** Find the pin on a node whose label (or id) matches `pinKey`. Used to resolve a widget's
 *  declared binding to a concrete pin. */
export function findPinByKey(node: Node, pinKey: string): Pin | undefined {
  for (const p of node.pins) if (pinMatches(p, pinKey)) return p
  return undefined
}

/** Find a pin's row index inside the body band (header-relative). Used to position a pin-bound
 *  widget inside the row that contains its pin. Returns undefined when the pin is hoisted onto
 *  the header line (no body row to place the widget in). */
export function pinRowIndexFor(node: Node, pinKey: string): number | undefined {
  const { execIn, execOut, dataIn, dataOut } = sectionPins(visiblePins(node))
  const { hoistIn, hoistOut } = hoisted(execIn, execOut)
  const bodyExecIn  = hoistIn  ? [] : execIn
  const bodyExecOut = hoistOut ? [] : execOut
  const bodyExecRows = Math.max(bodyExecIn.length, bodyExecOut.length)
  for (let i = 0; i < bodyExecIn.length;  i++) if (pinMatches(bodyExecIn[i]!,  pinKey)) return i
  for (let i = 0; i < bodyExecOut.length; i++) if (pinMatches(bodyExecOut[i]!, pinKey)) return i
  for (let i = 0; i < dataIn.length;  i++) if (pinMatches(dataIn[i]!,  pinKey)) return bodyExecRows + i
  for (let i = 0; i < dataOut.length; i++) if (pinMatches(dataOut[i]!, pinKey)) return bodyExecRows + i
  return undefined
}

/** Body height = header + pin rows (each row grown to fit its tallest visible bound widget) +
 *  free-floating custom widgets body band + optional actions row of button widgets + bottom
 *  padding mirroring the header→pins gap. */
function naturalHeight(node: Node, tokens: HeightTokens, isPinConnected?: (k: string) => boolean): number {
  const rows = pinRowCount(visiblePins(node, isPinConnected))
  const freeBand = freeWidgetsBandHeight(node, tokens.widget)
  const actions  = actionsRowHeight(node, tokens.widget)
  if (rows === 0 && actions === 0 && freeBand === 0) return tokens.node.headerHeight + tokens.header.toPinsGap
  const heights = pinRowHeights(node, tokens.pin.rowHeight, tokens.widget?.rowHeight ?? tokens.pin.rowHeight, isPinConnected)
  const rowsHeight = pinBandHeight(heights, tokens.pin.rowSpacing)
  return tokens.node.headerHeight + tokens.header.toPinsGap + rowsHeight + freeBand + actions + tokens.header.toPinsGap
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
  isPinConnected?: (pinKey: string) => boolean,
): number {
  // Title region: chevron sits at the left, title starts just past it. Keep the same trailing
  // padding on the right as the chevron's left inset for visual symmetry.
  const chevronCenterX = tokens.node.headerPadding + 8 + tokens.header.chevronSize / 2 - 4
  const titleX = chevronCenterX + tokens.header.chevronSize / 2 + tokens.header.titleGap
  // Cap the title's pull on width: short titles size the node fully, but a very long title is
  // ellipsised by the renderer instead of stretching the node forever. Pin/widget rows still drive
  // width uncapped, so a long PIN label always fits.
  const titleW = Math.min(measure(title, tokens.typography.titleSize, tokens.typography.titleWeight), TITLE_MAX_WIDTH)
  const { execIn, execOut, dataIn, dataOut } = sectionPins(visiblePins(node, isPinConnected))
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

  // Pin-bound widget: its pin's label sits on the left, control on the right of the same row.
  // For a custom widget that declares its own `height`, we render the control as a SQUARE — so the
  // width to reserve is the widget's height. Standard controls reserve the theme `controlMinWidth`.
  // A button widget stretches the full content width; its label itself must fit.
  let widgetNeed = 0
  if (tokens.widget && node.widgets) {
    for (const w of node.widgets) {
      if (w.type === 'button') {
        const btnW = measure(w.label, tokens.typography.labelSize, tokens.typography.labelWeight)
        widgetNeed = Math.max(widgetNeed, sidePad + btnW + sidePad)
        continue
      }
      const bind = widgetBindKey(w)
      if (bind === undefined) continue
      // Free-floating custom widget: full-width band row, just declared height (square not required).
      if (isFreeFloating(node, w)) {
        if (!widgetIsVisible(w, node)) continue
        const h = w.type === 'custom' ? (w.height ?? tokens.widget.rowHeight) : tokens.widget.rowHeight
        widgetNeed = Math.max(widgetNeed, sidePad + h + sidePad) // square-ish min so the body looks balanced
        continue
      }
      const visible = (widgetVisibility(w) === 'always' || !isPinConnected?.(bind)) && widgetIsVisible(w, node)
      if (!visible) continue
      const pinLabel = node.pins.find((p) => p.label === bind || String(p.id) === bind)?.label ?? ''
      const lblW = measure(pinLabel, tokens.typography.labelSize, tokens.typography.labelWeight)
      const ctrlW = (w.type === 'custom' && w.height !== undefined) ? w.height : tokens.widget.controlMinWidth
      widgetNeed = Math.max(widgetNeed, sidePad + lblW + LABEL_COLUMN_GUTTER + ctrlW + sidePad)
    }
  }

  return Math.max(tokens.node.minWidth, Math.ceil(titleNeed), Math.ceil(rowNeed), Math.ceil(widgetNeed))
}

/** Resolved render size for a node lacking an explicit `size`. Single source of truth: the editor
 *  backfills `node.size` with this so renderer, geom bounds, edge endpoints and the backdrop all
 *  agree on dimensions. */
export function measureNodeSize(
  node: Node, title: string, tokens: NodeSizeTokens, measure: TextMeasurer,
  isPinConnected?: (pinKey: string) => boolean,
): { x: number; y: number } {
  return {
    x: naturalWidth(node, title, tokens, measure, isPinConnected),
    y: naturalHeight(node, tokens, isPinConnected),
  }
}

export function computeNodeLayout(node: Node, tokens: LayoutTokens, isPinConnected?: (k: string) => boolean): NodeLayout {
  const width = node.size?.x ?? tokens.node.minWidth
  const height = node.size?.y ?? naturalHeight(node, tokens, isPinConnected)

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

  // Per-row pin heights — a row with a tall custom-widget bound to its pin (e.g. a 120px curve
  // editor) grows just THAT row, leaving the rest at the theme's pinRowHeight.
  const rowHeights = pinRowHeights(node, tokens.pin.rowHeight, tokens.widget?.rowHeight ?? tokens.pin.rowHeight, isPinConnected)
  const rowY = (rowIdx: number): number => node.position.y + pinRowCenterY(
    rowHeights, rowIdx, tokens.pin.rowSpacing, tokens.node.headerHeight, tokens.header.toPinsGap,
  )

  // UE-Blueprint placement. A single label-less exec pin is HOISTED onto the header line (exec-in at
  // the header's left edge, exec-out at the right, centred on the title). Otherwise exec pins form the
  // top body band (exec-in left / exec-out right), with data pins below — independent of declaration order.
  const { execIn, execOut, dataIn, dataOut } = sectionPins(visiblePins(node, isPinConnected))
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
