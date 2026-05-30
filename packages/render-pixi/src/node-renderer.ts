import {
  BlurFilter,
  CanvasTextMetrics,
  Circle,
  Container,
  FillGradient,
  Graphics,
  Rectangle,
  RenderTexture,
  Sprite,
  Text,
  BitmapText,
  TextStyle,
  Ticker,
  type Renderer,
  type Texture,
  type TextStyleFontWeight,
  type LinearGradientOptions,
} from 'pixi.js'
import type { StateStyle } from '@xenolith/theme-xen'
import type { Node, Pin, TypeRegistry } from '@xenolith/core'
import { widgetBindKey, widgetVisibility } from '@xenolith/core'
import { pinRowIndexFor } from './layout.js'
import type { XenTokens } from '@xenolith/theme-xen'
import { computeNodeLayout } from './layout.js'
import { renderWidgets, type WidgetHit, type WidgetLayoutTokens, type CustomWidgetController } from './widget-renderer.js'
import { execPinColors, hexToRgba, resolveCategoryAccent, resolveCategoryGradient, resolvePinFill, resolvePinShape, resolvePinStroke, type GraphCategoryPalette } from './style.js'

export type NodeVisualState = 'default' | 'hover' | 'selected' | 'active'

/** Metadata attached to every pin Graphics so the editor's stage-level pointer handlers can
 *  identify which pin was hit without reaching into renderer internals. */
export interface PinHandle {
  nodeId: string
  pinId: string
  direction: 'in' | 'out'
  kind: 'exec' | 'data'
  type: string
}

/** Hit-radius multiplier applied to pin Graphics. > 1 makes pins easier to grab with a mouse
 *  and gives finger-sized targets for tablets without changing the visual diameter. */
const PIN_HIT_RADIUS_FACTOR = 2.4

/** Read the PinHandle from a PIXI event target (or any DisplayObject). Returns null when the
 *  target is not a pin Graphics. Editor code uses this on stage `pointerdown` / `pointerover`. */
export function readPinHandle(target: unknown): PinHandle | null {
  if (!target || typeof target !== 'object') return null
  const handle = (target as { __xenPin?: PinHandle }).__xenPin
  return handle ?? null
}

export function markPinInteractive(
  g: Graphics,
  pin: Pin,
  nodeId: string,
  cx: number,
  cy: number,
  visualRadius: number,
): void {
  g.eventMode = 'static'
  g.cursor = 'crosshair'
  g.hitArea = new Circle(cx, cy, visualRadius * PIN_HIT_RADIUS_FACTOR)
  ;(g as unknown as { __xenPin: PinHandle }).__xenPin = {
    nodeId,
    pinId: String(pin.id),
    direction: pin.direction,
    kind: pin.kind,
    type: String(pin.type),
  }
}

export interface RenderNodeOptions {
  category?: string
  title?: string
  state?: NodeVisualState
  collapsed?: boolean
  /** Skip title ellipsis — used during inline rename so the live (possibly overflowing) title shows
   *  in full while the user types, matching the comment-rename behaviour. */
  fullTitle?: boolean
  /** Per-node header colour override (from `render.color` in the graph data). Beats category/theme. */
  color?: string
  /** Graph-level category palette (from `categories` in the graph data). Overrides theme tokens. */
  categoryPalette?: GraphCategoryPalette
  /** Active PIXI Renderer — when provided, selection/hover/active glow strokes are baked into
   *  shared textures keyed by (size × radius × style). Without it, each glow falls back to a
   *  live BlurFilter (acceptable for unit tests, expensive at scale). */
  renderer?: Renderer | null
  /** Called whenever the view mutates outside the editor's knowledge — currently the internal
   *  collapse/expand animation, which drives itself on Ticker.shared. The editor uses this to
   *  mark its render-on-demand loop dirty so animation frames actually paint. */
  requestRender?: () => void
  /** Host-registered custom widget controllers, keyed by the `renderer` name on a `custom` widget. */
  customWidgets?: ReadonlyMap<string, CustomWidgetController>
  /** Custom pin-type descriptors — a pin whose type the theme doesn't know falls back to the
   *  registered descriptor's colour instead of the generic `any` grey. */
  types?: TypeRegistry
  /** A small glyph drawn in the header to mark a node without relying on colour. `svg` is the inner
   *  markup of a 24×24 icon (the editor resolves a {@link NodeGlyph} name via its icon registry);
   *  `side` picks which side of the title it sits on. Positioning/centring is automatic. */
  glyph?: { svg: string; side: 'left' | 'right' }
  /** PinIds (string) on this node that currently have at least one edge attached. Drives the
   *  exec-pin paint (filled gold when connected, outlined white when not). The renderer treats
   *  an absent set as "nothing connected" — safe default for headless tests. */
  connectedPinIds?: ReadonlySet<string>
  /** Live runtime value flowing into this node's bound pin (used by `'always'` display widgets
   *  so they show the wire's current value, not the stored default). Editor binds this from the
   *  host's runtime plugin; tests usually omit it. */
  pinLiveValue?: (pinKey: string) => unknown
}

export interface NodeView {
  readonly container: Container
  setVisualState(state: NodeVisualState): void
  setCollapsed(collapsed: boolean, animated?: boolean): void
  isCollapsed(): boolean
  /** The collapsed header pill's rect (+ corner radius) in node-local coords. Lets the editor
   *  occlude DOM widgets behind a collapsed node by its actual rounded pill, not its full size. */
  readonly collapsedRect?: { x: number; y: number; w: number; h: number; r: number }
  /** Centre of a pin in the node's local coordinates given the current visual state.
   *  Edge renderers use this to track pin positions as nodes collapse/expand. */
  pinLocalPosition(pinId: string): { x: number; y: number } | null
  /** Widget under a node-local point (expanded form only), or null. Absent on views without
   *  widgets (reroutes, themes that don't draw them). */
  widgetHit?(localX: number, localY: number): WidgetHit | null
  /** Cheaply refresh one widget's visual to a new value (live slider/number drag). */
  updateWidget?(id: string, value: unknown): void
}

const COLLAPSE_DURATION_MS = 220

function buildTopRoundedRect(g: Graphics, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h))
  return g
    .moveTo(x + radius, y)
    .lineTo(x + w - radius, y)
    .arcTo(x + w, y, x + w, y + radius, radius)
    .lineTo(x + w, y + h)
    .lineTo(x, y + h)
    .lineTo(x, y + radius)
    .arcTo(x, y, x + radius, y, radius)
    .closePath()
}

function buildTopRimPath(g: Graphics, x: number, y: number, w: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2))
  return g
    .moveTo(x, y + radius)
    .arcTo(x, y, x + radius, y, radius)
    .lineTo(x + w - radius, y)
    .arcTo(x + w, y, x + w, y + radius, radius)
}

function buildChevron(g: Graphics, cx: number, cy: number, size: number) {
  const halfW = size * 0.22
  const halfH = size * 0.11
  return g
    .moveTo(cx - halfW, cy - halfH)
    .lineTo(cx, cy + halfH)
    .lineTo(cx + halfW, cy - halfH)
}

/** Append a pin glyph path to `g`: a right-pointing arrow (exec/control flow), a diamond (e.g. struct
 *  types), or a circle (data). Shared by both renderers + the expanded/collapsed pin paths. */
export function buildPinShape(g: Graphics, shape: 'circle' | 'diamond' | 'arrow', x: number, y: number, r: number): Graphics {
  if (shape === 'arrow') return g.moveTo(x - r, y - r * 1.15).lineTo(x + r * 1.2, y).lineTo(x - r, y + r * 1.15).closePath()
  if (shape === 'diamond') return g.moveTo(x, y - r * 1.25).lineTo(x + r * 1.25, y).lineTo(x, y + r * 1.25).lineTo(x - r * 1.25, y).closePath()
  return g.circle(x, y, r)
}

/** A filled+stroked pin Graphics of the given shape. `fillAlpha < 1` lets the exec-pin outline
 *  style (transparent triangle, white stroke) reuse the same drawing path as a normal data pin. */
function drawPin(shape: 'circle' | 'diamond' | 'arrow', x: number, y: number, r: number, fill: string, stroke: string, strokeW: number, fillAlpha = 1): Graphics {
  return buildPinShape(new Graphics(), shape, x, y, r).fill({ color: fill, alpha: fillAlpha }).stroke({ color: stroke, width: strokeW })
}

/** Pin paint for a single pin: exec pins use the connected/unconnected scheme; everything else
 *  follows the type-driven theme tokens. Centralised so expanded + collapsed paths agree. */
function pinPaint(
  pin: Pin,
  tokens: XenTokens,
  opts: RenderNodeOptions,
): { fill: string; stroke: string; fillAlpha: number } {
  if (pin.kind === 'exec') {
    const connected = opts.connectedPinIds?.has(String(pin.id)) ?? false
    return execPinColors(connected)
  }
  return { fill: resolvePinFill(String(pin.type), tokens, opts.types), stroke: resolvePinStroke(String(pin.type), tokens), fillAlpha: 1 }
}

/** A header glyph scaled to a `size`×`size` box. `svgInner` is the inner markup of a 24×24 viewBox
 *  (resolve a name via {@link IconRegistry}); the art is centred within the box, so place its
 *  top-left at `(x, centerY - size/2)` to centre it on a line. Shared by Xen + Liquid Glass. */
export function makeHeaderIcon(svgInner: string, color: string, size: number): Graphics {
  const g = new Graphics()
  g.svg(`<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgInner}</svg>`)
  g.scale.set(size / 24)
  return g
}

/** Module-level cache of pre-blurred glow textures keyed by signature. The dominant cost in
 *  selection rendering is the BlurFilter running per-node-per-frame — caching means each unique
 *  (size × radius × style) combination is blurred ONCE and shared across every node that uses
 *  it. For a 500-node graph with ~10 unique node sizes that's ~30 textures total (3 states),
 *  down from 500×3 = 1500 per-frame filter passes. Collapsed pill is identical size for every
 *  node → exactly 3 textures cover every pill in the graph. */
const glowTextureCache = new Map<string, Texture>()

/** Padding around the rounded rect inside the baked texture — the blur kernel extends past the
 *  stroke and would clip if we baked at exactly (w × h). */
function glowPadding(strength: number): number {
  return Math.max(strength * 4, 32)
}

function glowSignature(style: StateStyle, w: number, h: number, radius: number): string {
  return [
    w, h, radius,
    String(style.glow ?? ''),
    style.glowBlur ?? 10,
    style.glowWidth ?? 3,
  ].join('|')
}

function bakeGlowTexture(
  renderer: Renderer,
  style: StateStyle & { glow: string },
  w: number, h: number, radius: number,
): Texture {
  const strength = style.glowBlur ?? 10
  const pad = glowPadding(strength)
  const glow = new Graphics()
    .roundRect(pad, pad, w, h, radius)
    .stroke({ color: style.glow, width: style.glowWidth ?? 3, alignment: 0.5 })
  // BlurFilter with `antialias: 'on'` races the filter pipeline when rendered into a fresh
  // RenderTexture mid-frame (PIXI v8 — BindGroup.setResource null at index 2 on insertNode).
  // The blur kernel already eliminates aliasing on the stroke, so 'on' is pure cost + risk.
  const blur = new BlurFilter({ strength, quality: 4 })
  blur.padding = pad
  glow.filters = [blur]

  const rt = RenderTexture.create({
    width:      w + pad * 2,
    height:     h + pad * 2,
    resolution: renderer.resolution,
  })
  renderer.render({ container: glow, target: rt })
  glow.destroy()
  return rt
}

function makeGlowLayer(
  style: StateStyle,
  w: number, h: number, radius: number,
  renderer: Renderer | null,
): Container {
  const layer = new Container()
  layer.visible = false
  if (style.glow === undefined) return layer
  // Defensive: a zero-size glow would build a 0×0 RenderTexture and PIXI's filter pipeline
  // crashes on the resolve step. Just skip the cache lookup and return the empty layer —
  // selection visuals will reappear once the node has a real size.
  if (w <= 0 || h <= 0) return layer

  // Glow source is a STROKE, not a fill. A blurred filled rectangle leaks brighter halos along
  // the long edges than at the corners. A blurred perimeter stroke traces the contour exactly;
  // the body drawn on top hides the inward half, leaving a uniform outward halo regardless of
  // edge length.
  if (renderer) {
    const sig = glowSignature(style, w, h, radius)
    let tex = glowTextureCache.get(sig)
    if (!tex) {
      tex = bakeGlowTexture(renderer, style as StateStyle & { glow: string }, w, h, radius)
      glowTextureCache.set(sig, tex)
    }
    const strength = style.glowBlur ?? 10
    const pad = glowPadding(strength)
    const sprite = new Sprite(tex)
    sprite.position.set(-pad, -pad)
    layer.addChild(sprite)
    return layer
  }

  // Fallback path for environments without a renderer (unit tests etc.) — live BlurFilter.
  const strength = style.glowBlur ?? 10
  const glow = new Graphics()
    .roundRect(0, 0, w, h, radius)
    .stroke({ color: style.glow, width: style.glowWidth ?? 3, alignment: 0.5 })
  const blur = new BlurFilter({ strength, quality: 4, antialias: 'on' })
  blur.padding = glowPadding(strength)
  glow.filters = [blur]
  layer.addChild(glow)
  return layer
}

/** Drop the module-level cache — call when switching themes or on editor disposal to free the
 *  GPU memory the baked glow textures hold. */
export function clearGlowTextureCache(): void {
  for (const tex of glowTextureCache.values()) tex.destroy(true)
  glowTextureCache.clear()
}

/** A FillGradient owns a GPU texture that Graphics.destroy() does NOT release (per PIXI docs), so a
 *  fresh `new FillGradient` per node leaks one texture per node on every create/destroy — which, under
 *  virtualization's pan/zoom churn, exhausts GPU memory and crashes the context. Gradients here use
 *  `textureSpace: 'local'` (0–1 coords), so one instance is valid for nodes of ANY size: cache by the
 *  options signature and share. Shared instances are never destroyed on node teardown (like glow). */
const gradientCache = new Map<string, FillGradient>()

function sharedGradient(options: LinearGradientOptions): FillGradient {
  const key = JSON.stringify(options)
  let g = gradientCache.get(key)
  if (!g) { g = new FillGradient(options); gradientCache.set(key, g) }
  return g
}

/** Drop the shared gradient cache (theme switch / disposal) — releases the gradient textures. */
export function clearGradientCache(): void {
  for (const g of gradientCache.values()) g.destroy()
  gradientCache.clear()
}

function makeBorderLayer(style: StateStyle, w: number, h: number, radius: number): Container {
  const layer = new Container()
  layer.visible = false
  if (style.border !== undefined) {
    const border = new Graphics()
      .roundRect(0, 0, w, h, radius)
      .stroke({
        color: style.border,
        width: style.borderWidth ?? 1,
        alignment: 0.5,
      })
    layer.addChild(border)
  }
  return layer
}

interface PinPosition {
  pinId: string
  x: number
  y: number
}

/** Compute pin positions on the pill (collapsed) form — placed along the curved end caps so each
 *  pin sits tangent to the rounded edge, not floating off to one side. */
function collapsedPinPositions(
  pins: Pin[],
  pillW: number,
  pillH: number,
  pillR: number,
): PinPosition[] {
  const inputs = pins.filter((p) => p.direction === 'in')
  const outputs = pins.filter((p) => p.direction === 'out')
  const cy = pillH / 2
  // Angular layout: ~50° between pins, clamped to 170° total spread.
  const idealStep = Math.PI / 3.6
  const maxTotal = Math.PI * 0.94
  const arc = (count: number, idx: number): number => {
    if (count <= 1) return 0
    const total = Math.min(maxTotal, (count - 1) * idealStep)
    const step = total / (count - 1)
    return -total / 2 + idx * step
  }
  const out: PinPosition[] = []
  // Inputs on the left semicircle, centre at (pillR, cy).
  inputs.forEach((p, i) => {
    const angle = arc(inputs.length, i)
    out.push({
      pinId: p.id,
      x: pillR - pillR * Math.cos(angle),
      y: cy + pillR * Math.sin(angle),
    })
  })
  // Outputs on the right semicircle, centre at (pillW - pillR, cy).
  outputs.forEach((p, i) => {
    const angle = arc(outputs.length, i)
    out.push({
      pinId: p.id,
      x: pillW - pillR + pillR * Math.cos(angle),
      y: cy + pillR * Math.sin(angle),
    })
  })
  return out
}

export function renderNode(
  node: Node,
  tokens: XenTokens,
  opts: RenderNodeOptions = {},
): NodeView {
  const geo = tokens.geometry
  // Pin-bound widget hides when the bound pin is connected — share the same predicate the widget
  // renderer uses so node geometry (row heights, pin Y) and widget rects always agree.
  // Widget bind keys are pin LABELS/keys (auto-mint pin ids are unknown to schema authors), but
  // `connectedPinIds` is keyed by the real pin id — resolve the bind to a pin first, then check.
  const isPinConnected = (k: string): boolean => {
    const set = opts.connectedPinIds
    if (!set) return false
    const pin = node.pins.find((p) => p.label === k || String(p.id) === k)
    return pin ? set.has(String(pin.id)) : false
  }
  const expandedLayout = computeNodeLayout(node, {
    node:   geo.node,
    pin:    { diameter: geo.pin.diameter, rowSpacing: geo.pin.rowSpacing, rowHeight: geo.pin.rowHeight },
    header: { toPinsGap: geo.header.toPinsGap },
    widget: { rowHeight: geo.widget.rowHeight, gap: geo.widget.gap, controlMinWidth: geo.widget.controlMinWidth },
  }, isPinConnected)

  const container = new Container({ label: `node:${node.id}` })
  container.position.set(node.position.x, node.position.y)

  // ============================================================================================
  // EXPANDED FORM
  // ============================================================================================
  const expanded = new Container({ label: 'expanded' })
  container.addChild(expanded)

  const w = expandedLayout.body.width
  const h = expandedLayout.body.height

  const glowLayers: Record<Exclude<NodeVisualState, 'default'>, Container> = {
    hover:    makeGlowLayer(tokens.state.hover,    w, h, geo.node.radius, opts.renderer ?? null),
    selected: makeGlowLayer(tokens.state.selected, w, h, geo.node.radius, opts.renderer ?? null),
    active:   makeGlowLayer(tokens.state.active,   w, h, geo.node.radius, opts.renderer ?? null),
  }
  expanded.addChild(glowLayers.hover, glowLayers.selected, glowLayers.active)

  const body = new Graphics()
    .roundRect(0, 0, w, h, geo.node.radius)
    .fill({ color: tokens.color.surface.node })
  expanded.addChild(body)

  const padding = geo.node.headerPadding
  const headerInnerWidth = w - padding * 2
  const headerInnerHeight = geo.node.headerHeight - padding
  const headerRadius = Math.max(geo.node.radius - 2, 0)

  const gradient = resolveCategoryGradient(opts.category, tokens, opts.categoryPalette, opts.color)
  const headerFill = sharedGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
    colorStops: [
      { offset: 0, color: gradient.start },
      { offset: 1, color: gradient.end },
    ],
    textureSpace: 'local',
  })
  const headerInner = new Graphics()
  buildTopRoundedRect(headerInner, padding, padding, headerInnerWidth, headerInnerHeight, headerRadius).fill(headerFill)
  expanded.addChild(headerInner)

  const fadeStop = Math.min(
    1,
    (tokens.effect.headerInnerShadow.blur + tokens.effect.headerInnerShadow.offsetY) / headerInnerHeight,
  )
  const highlightFill = sharedGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: 'rgba(255, 255, 255, 0.25)' },
      { offset: fadeStop, color: 'rgba(255, 255, 255, 0)' },
    ],
    textureSpace: 'local',
  })
  const headerHighlight = new Graphics()
  buildTopRoundedRect(headerHighlight, padding, padding, headerInnerWidth, headerInnerHeight, headerRadius).fill(highlightFill)
  expanded.addChild(headerHighlight)

  const rimGradient = sharedGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: 'rgba(255, 255, 255, 0.8)' },
      { offset: 1, color: 'rgba(255, 255, 255, 0)' },
    ],
    textureSpace: 'local',
  })
  const headerRim = new Graphics()
  buildTopRimPath(headerRim, padding, padding, headerInnerWidth, headerRadius).stroke({
    width: 0.75,
    fill: rimGradient,
    alignment: 0,
  })
  expanded.addChild(headerRim)

  const chevronY = padding + geo.node.headerHeight / 2 - 0.5
  const chevronCenterX = padding + 8 + geo.header.chevronSize / 2 - 4
  const chevron = new Graphics()
  // Draw at origin (0,0); position the Graphics so rotation pivots around the chevron centre.
  buildChevron(chevron, 0, 0, geo.header.chevronSize).stroke({
    color: tokens.color.text.primary,
    width: 1,
    cap: 'round',
    join: 'round',
  })
  chevron.position.set(chevronCenterX, chevronY)
  chevron.eventMode = 'static'
  expanded.addChild(chevron)

  // Header glyph — a small icon marking the node, drawn left or right of the title. Reserves its
  // width so the title shifts in; the glyph itself is positioned after the title is laid out so it
  // can centre on the title's optical middle.
  const glyph = opts.glyph
  const iconSize = glyph ? Math.round(tokens.typography.heading.size + 1) : 0
  const leftGlyph = glyph?.side === 'left'
  const rightGlyph = glyph?.side === 'right'
  const baseTitleX = chevronCenterX + geo.header.chevronSize / 2 + geo.header.titleGap
  const titleStartX = leftGlyph ? baseTitleX + iconSize + geo.header.titleGap : baseTitleX
  const title = new BitmapText({
    text: opts.title ?? node.type,
    style: {
      fontFamily: tokens.typography.fontFamily,
      fontSize:   tokens.typography.heading.size,
      fontWeight: '700',
      fill:       tokens.typography.heading.color,
    },
  })
  // Ellipsise the title to the header's available width (node may be sized by its pin labels, not the
  // full title — e.g. after a long rename) so it never bleeds past the node's right edge. A right-side
  // glyph also reserves room at the right edge.
  const maxTitleW = w - titleStartX - geo.node.headerPadding - 6 - (rightGlyph ? iconSize + geo.header.titleGap : 0)
  if (!opts.fullTitle && maxTitleW > 0) {
    const full = opts.title ?? node.type
    if (title.width > maxTitleW) {
      let cut = full
      while (cut.length > 1 && title.width > maxTitleW) { cut = cut.slice(0, -1); title.text = `${cut}…` }
    }
  }
  title.position.set(titleStartX, 3)
  expanded.addChild(title)
  if (glyph) {
    // Centre the glyph's box on the title's optical middle so the glyph + text read on one line.
    const icon = makeHeaderIcon(glyph.svg, tokens.typography.heading.color, iconSize)
    const iconX = leftGlyph ? baseTitleX : w - geo.node.headerPadding - iconSize
    icon.position.set(iconX, title.position.y + title.height / 2 - iconSize / 2)
    expanded.addChild(icon)
  }

  const borderLayers: Record<Exclude<NodeVisualState, 'default'>, Container> = {
    hover:    makeBorderLayer(tokens.state.hover,    w, h, geo.node.radius),
    selected: makeBorderLayer(tokens.state.selected, w, h, geo.node.radius),
    active:   makeBorderLayer(tokens.state.active,   w, h, geo.node.radius),
  }
  expanded.addChild(borderLayers.hover, borderLayers.selected, borderLayers.active)

  // Pin Graphics & labels for expanded form. We also track pin position lookups for edge wiring.
  const expandedPinLocations = new Map<string, { x: number; y: number }>()
  const pinLabels: BitmapText[] = []
  // Rows that host a visible bound widget — the widget rect sits in the RIGHT HALF of the row.
  // We only suppress the OPPOSITE-side (right) pin's label on those rows: that's the one whose
  // text anchors to the right edge and lands inside the widget area. The LEFT pin's label (next
  // to its pin dot) is far from the widget and stays visible — that's the row's actual name,
  // hiding it just leaves a nameless row of dots.
  const rowsWithWidget = new Set<number>()
  for (const w of node.widgets ?? []) {
    if (w.type === 'button') continue
    const bind = widgetBindKey(w)
    if (bind === undefined) continue
    const pin = node.pins.find((p) => p.label === bind || String(p.id) === bind)
    if (!pin) continue
    const visible = widgetVisibility(w) === 'always' || !(isPinConnected(bind))
    if (!visible) continue
    const rowIdx = pinRowIndexFor(node, bind)
    if (rowIdx !== undefined) rowsWithWidget.add(rowIdx)
  }
  const pinLabelHidden = (pin: Pin, side: 'left' | 'right'): boolean => {
    if (rowsWithWidget.size === 0 || side === 'left') return false
    const idx = pinRowIndexFor(node, String(pin.id))
    return idx !== undefined && rowsWithWidget.has(idx)
  }
  for (const pin of node.pins) {
    const layoutPin = expandedLayout.pins.find((p) => p.id === pin.id)
    if (!layoutPin) continue
    const localX = layoutPin.x - node.position.x
    const localY = layoutPin.y - node.position.y
    expandedPinLocations.set(pin.id, { x: localX, y: localY })
    const radius = geo.pin.diameter / 2
    const paint = pinPaint(pin, tokens, opts)
    const pinGfx = drawPin(resolvePinShape(String(pin.type), pin.kind, opts.types), localX, localY, radius, paint.fill, paint.stroke, geo.pin.stroke, paint.fillAlpha)
    markPinInteractive(pinGfx, pin, String(node.id), localX, localY, radius)
    expanded.addChild(pinGfx)

    if (pin.label && !pinLabelHidden(pin, layoutPin.side)) {
      const label = new BitmapText({
        text: pin.label,
        style: {
          fontFamily: tokens.typography.fontFamily,
          fontSize:   tokens.typography.label.size,
          fontWeight: String(tokens.typography.label.weight) as TextStyleFontWeight,
          fill:       tokens.typography.label.color,
        },
      })
      if (layoutPin.side === 'left') {
        label.anchor.set(0, 0.5)
        label.position.set(localX + radius + geo.pin.labelGap, localY)
      } else {
        label.anchor.set(1, 0.5)
        label.position.set(localX - radius - geo.pin.labelGap, localY)
      }
      pinLabels.push(label)
      expanded.addChild(label)
    }
  }

  // ============================================================================================
  // COLLAPSED FORM (pill)
  // ============================================================================================
  const collapsed = new Container({ label: 'collapsed' })
  collapsed.visible = false
  collapsed.alpha = 0
  container.addChild(collapsed)

  const pillH = geo.node.pillHeight
  const pillR = geo.node.pillRadius
  // Pill width fits the collapsed title (chevron at x≈16, title just past it) plus a trailing cap,
  // not a fixed minimum — long titles otherwise overflow the capsule.
  const pillIconSize = glyph ? Math.round(tokens.typography.heading.size + 1) : 0
  const basePillTitleX = 16 + geo.header.chevronSize / 2 + geo.header.titleGap
  const pillTitleStartX = leftGlyph ? basePillTitleX + pillIconSize + geo.header.titleGap : basePillTitleX
  const pillTitleWidth = CanvasTextMetrics.measureText(
    opts.title ?? node.type,
    new TextStyle({ fontFamily: tokens.typography.fontFamily, fontSize: tokens.typography.heading.size, fontWeight: '700' }),
  ).width
  const pillTitleEndX = pillTitleStartX + pillTitleWidth + (rightGlyph ? geo.header.titleGap + pillIconSize : 0)
  const pillW = Math.max(geo.node.pillMinWidth, pillTitleEndX + pillR)
  // Centre the pill vertically within the (taller) expanded body so the node's anchor doesn't shift.
  // Canon: a node collapses UP to its header (pill sits at the top), not to the vertical centre —
  // important now that widget nodes are tall.
  const pillOffsetY = 0

  // Glow layers for pill form. Drawn behind the pill body so the halo bleeds outside the capsule.
  const pillGlowLayers: Record<Exclude<NodeVisualState, 'default'>, Container> = {
    hover:    makeGlowLayer(tokens.state.hover,    pillW, pillH, pillR, opts.renderer ?? null),
    selected: makeGlowLayer(tokens.state.selected, pillW, pillH, pillR, opts.renderer ?? null),
    active:   makeGlowLayer(tokens.state.active,   pillW, pillH, pillR, opts.renderer ?? null),
  }
  for (const l of Object.values(pillGlowLayers)) l.position.set(0, pillOffsetY)
  collapsed.addChild(pillGlowLayers.hover, pillGlowLayers.selected, pillGlowLayers.active)

  const accent = opts.color ?? resolveCategoryAccent(opts.category, tokens, opts.categoryPalette)

  // Two layers: opaque body, then accent gradient on top — matches Figma's
  // `background: linear-gradient(...), #0F110E` (gradient layered over a solid fill).
  const pillBg = new Graphics()
    .roundRect(0, pillOffsetY, pillW, pillH, pillR)
    .fill({ color: tokens.color.surface.node })
  collapsed.addChild(pillBg)

  // Figma stops are at 12.63% / 51.57% / 90.91% — accent confined to centre, fading at edges.
  const pillFill = sharedGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
    colorStops: [
      { offset: 0,        color: hexToRgba(tokens.color.surface.node, 0.5) },
      { offset: 0.1263,   color: hexToRgba(tokens.color.surface.node, 0.5) },
      { offset: 0.5157,   color: hexToRgba(accent, 0.3) },
      { offset: 0.9091,   color: hexToRgba(tokens.color.surface.node, 0.5) },
      { offset: 1,        color: hexToRgba(tokens.color.surface.node, 0.5) },
    ],
    textureSpace: 'local',
  })
  const pillAccent = new Graphics()
    .roundRect(0, pillOffsetY, pillW, pillH, pillR)
    .fill(pillFill)
  collapsed.addChild(pillAccent)

  // Inset top highlight — consistent with the expanded header rim. Vertical white→transparent
  // gradient, contained to the top portion of the pill.
  const pillHighlightFadeStop = Math.min(
    1,
    (tokens.effect.pillInnerShadow.blur + tokens.effect.pillInnerShadow.offsetY) / pillH,
  )
  const pillHighlightFill = sharedGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0,                       color: 'rgba(255, 255, 255, 0.18)' },
      { offset: pillHighlightFadeStop,   color: 'rgba(255, 255, 255, 0)' },
    ],
    textureSpace: 'local',
  })
  const pillHighlight = new Graphics()
    .roundRect(0, pillOffsetY, pillW, pillH, pillR)
    .fill(pillHighlightFill)
  collapsed.addChild(pillHighlight)

  // Thin bright stroke along the very top edge of the capsule — mirrors expanded's `headerRim`.
  const pillRimFill = sharedGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: 'rgba(255, 255, 255, 0.55)' },
      { offset: 1, color: 'rgba(255, 255, 255, 0)' },
    ],
    textureSpace: 'local',
  })
  const pillRim = new Graphics()
    .roundRect(0, pillOffsetY, pillW, pillH, pillR)
    .stroke({ width: 0.75, fill: pillRimFill, alignment: 0 })
  // Mask so only the top half of the stroke shows.
  const pillRimMask = new Graphics()
    .rect(-4, pillOffsetY - 4, pillW + 8, pillH / 2 + 4)
    .fill({ color: 0xffffff })
  collapsed.addChild(pillRimMask)
  pillRim.mask = pillRimMask
  collapsed.addChild(pillRim)

  // Pill chevron — rotated 90° clockwise (points right when collapsed).
  const pillChevron = new Graphics()
  const pillChevronCX = 16
  const pillChevronCY = pillOffsetY + pillH / 2
  buildChevron(pillChevron, 0, 0, geo.header.chevronSize).stroke({
    color: tokens.color.text.primary,
    width: 1.2,
    cap: 'round',
    join: 'round',
  })
  pillChevron.position.set(pillChevronCX, pillChevronCY)
  pillChevron.rotation = -Math.PI / 2
  collapsed.addChild(pillChevron)

  const pillTitle = new BitmapText({
    text: opts.title ?? node.type,
    style: {
      fontFamily: tokens.typography.fontFamily,
      fontSize:   tokens.typography.heading.size,
      fontWeight: '700',
      fill:       tokens.typography.heading.color,
    },
  })
  pillTitle.position.set(pillTitleStartX, pillOffsetY + (pillH - tokens.typography.heading.lineHeight) / 2)
  collapsed.addChild(pillTitle)
  if (glyph) {
    // Same glyph as the expanded header, centred on the pill title's optical middle.
    const pillIcon = makeHeaderIcon(glyph.svg, tokens.typography.heading.color, pillIconSize)
    const pillIconX = leftGlyph ? basePillTitleX : pillTitleStartX + pillTitleWidth + geo.header.titleGap
    pillIcon.position.set(pillIconX, pillTitle.position.y + pillTitle.height / 2 - pillIconSize / 2)
    collapsed.addChild(pillIcon)
  }

  // Border layers — on top of body+title but UNDER pins (so pins overlap the rim).
  const pillBorderLayers: Record<Exclude<NodeVisualState, 'default'>, Container> = {
    hover:    makeBorderLayer(tokens.state.hover,    pillW, pillH, pillR),
    selected: makeBorderLayer(tokens.state.selected, pillW, pillH, pillR),
    active:   makeBorderLayer(tokens.state.active,   pillW, pillH, pillR),
  }
  for (const l of Object.values(pillBorderLayers)) l.position.set(0, pillOffsetY)
  collapsed.addChild(pillBorderLayers.hover, pillBorderLayers.selected, pillBorderLayers.active)

  const pillPinLocations = new Map<string, { x: number; y: number }>()
  const pillPinPositions = collapsedPinPositions(node.pins, pillW, pillH, pillR)
  for (const pp of pillPinPositions) {
    const pin = node.pins.find((p) => p.id === pp.pinId)
    if (!pin) continue
    const localX = pp.x
    const localY = pillOffsetY + pp.y
    pillPinLocations.set(pin.id, { x: localX, y: localY })
    const radius = geo.pin.diameter / 2
    const paint = pinPaint(pin, tokens, opts)
    const pinGfx = drawPin(resolvePinShape(String(pin.type), pin.kind, opts.types), localX, localY, radius, paint.fill, paint.stroke, geo.pin.stroke, paint.fillAlpha)
    markPinInteractive(pinGfx, pin, String(node.id), localX, localY, radius)
    collapsed.addChild(pinGfx)
  }

  // ============================================================================================
  // STATE & ANIMATION
  // ============================================================================================
  let isCollapsedState = opts.collapsed ?? false
  let collapseFraction = isCollapsedState ? 1 : 0
  let animationTicker: ((delta: { deltaMS: number }) => void) | null = null

  function applyFraction(f: number): void {
    const expandedAlpha = 1 - f
    const collapsedAlpha = f
    expanded.alpha = expandedAlpha
    expanded.visible = expandedAlpha > 0.001
    collapsed.alpha = collapsedAlpha
    collapsed.visible = collapsedAlpha > 0.001
    // Rotate the expanded chevron from 0 → -90° as we collapse.
    chevron.rotation = -f * (Math.PI / 2)
    // Bound node hit-testing to the visible body (or pill when collapsed). Without an explicit
    // hitArea, PIXI unions the children's bounds — which include the blur-padded glow layers — so a
    // hovered/selected node would have a hit/drag radius far larger than the node itself.
    container.hitArea = f >= 0.5
      ? new Rectangle(0, pillOffsetY, pillW, pillH)
      : new Rectangle(0, 0, w, h)
  }

  applyFraction(collapseFraction)

  function setCollapsed(c: boolean, animated = true): void {
    if (c === isCollapsedState && (collapseFraction === 0 || collapseFraction === 1)) return
    isCollapsedState = c
    const targetFraction = c ? 1 : 0
    if (!animated) {
      collapseFraction = targetFraction
      applyFraction(targetFraction)
      opts.requestRender?.()
      return
    }
    if (animationTicker) {
      Ticker.shared.remove(animationTicker)
      animationTicker = null
    }
    const start = collapseFraction
    const delta = targetFraction - start
    let elapsed = 0
    animationTicker = (tick) => {
      elapsed += tick.deltaMS
      const t = Math.min(1, elapsed / COLLAPSE_DURATION_MS)
      // ease-out cubic for snappy feel
      const eased = 1 - Math.pow(1 - t, 3)
      collapseFraction = start + delta * eased
      applyFraction(collapseFraction)
      opts.requestRender?.()
      if (t >= 1 && animationTicker) {
        Ticker.shared.remove(animationTicker)
        animationTicker = null
      }
    }
    Ticker.shared.add(animationTicker)
  }

  function setVisualState(state: NodeVisualState): void {
    glowLayers.hover.visible      = state === 'hover'
    glowLayers.selected.visible   = state === 'selected'
    glowLayers.active.visible     = state === 'active'
    borderLayers.hover.visible    = state === 'hover'
    borderLayers.selected.visible = state === 'selected'
    borderLayers.active.visible   = state === 'active'
    pillGlowLayers.hover.visible      = state === 'hover'
    pillGlowLayers.selected.visible   = state === 'selected'
    pillGlowLayers.active.visible     = state === 'active'
    pillBorderLayers.hover.visible    = state === 'hover'
    pillBorderLayers.selected.visible = state === 'selected'
    pillBorderLayers.active.visible   = state === 'active'
  }
  setVisualState(opts.state ?? 'default')

  function pinLocalPosition(pinId: string): { x: number; y: number } | null {
    const expandedPos = expandedPinLocations.get(pinId)
    const pillPos = pillPinLocations.get(pinId)
    if (!expandedPos && !pillPos) return null
    if (!expandedPos) return pillPos!
    if (!pillPos) return expandedPos
    // Interpolate based on current animation fraction.
    return {
      x: expandedPos.x + (pillPos.x - expandedPos.x) * collapseFraction,
      y: expandedPos.y + (pillPos.y - expandedPos.y) * collapseFraction,
    }
  }

  // Toggle on chevron click — both forms' chevrons act as a toggle button.
  function onChevronClick(): void {
    setCollapsed(!isCollapsedState, true)
  }
  chevron.cursor = 'pointer'
  chevron.eventMode = 'static'
  // Hit area is in LOCAL coordinates. Chevron Graphics is drawn at (0,0) and positioned via
  // `chevron.position.set(chevronCenterX, chevronY)`, so the centre is (0,0) in local space.
  chevron.hitArea = { contains: (px, py) =>
    Math.abs(px) <= geo.header.chevronSize / 2 &&
    Math.abs(py) <= geo.header.chevronSize / 2,
  }
  chevron.on('pointerdown', (e) => {
    onChevronClick()
    e.stopPropagation()
  })
  pillChevron.cursor = 'pointer'
  pillChevron.eventMode = 'static'
  pillChevron.hitArea = { contains: (px, py) =>
    Math.hypot(px, py) <= geo.header.chevronSize,
  }
  pillChevron.on('pointerdown', (e) => {
    onChevronClick()
    e.stopPropagation()
  })

  // Widget rows live in the expanded form (below the pins); the pill form has none.
  const widgetLayoutTokens: WidgetLayoutTokens = {
    node:   { headerHeight: geo.node.headerHeight },
    pin:    { rowSpacing: geo.pin.rowSpacing, rowHeight: geo.pin.rowHeight, diameter: geo.pin.diameter, labelGap: geo.pin.labelGap },
    header: { toPinsGap: geo.header.toPinsGap },
    widget: { rowHeight: geo.widget.rowHeight, gap: geo.widget.gap, paddingX: geo.widget.paddingX },
  }
  const widgetsView =
    node.widgets && node.widgets.length > 0
      ? renderWidgets(node, w, tokens, widgetLayoutTokens, opts.customWidgets, { isPinConnected, ...(opts.pinLiveValue ? { pinLiveValue: opts.pinLiveValue } : {}) })
      : null
  if (widgetsView) expanded.addChild(widgetsView.container)

  const view: NodeView = {
    container,
    setVisualState,
    setCollapsed,
    isCollapsed: () => isCollapsedState,
    pinLocalPosition,
    collapsedRect: { x: 0, y: pillOffsetY, w: pillW, h: pillH, r: pillR },
  }
  if (widgetsView) {
    view.widgetHit = (x, y): WidgetHit | null => (isCollapsedState ? null : widgetsView.widgetHit(x, y))
    view.updateWidget = (id, value): void => widgetsView.update(id, value)
  }
  return view
}
