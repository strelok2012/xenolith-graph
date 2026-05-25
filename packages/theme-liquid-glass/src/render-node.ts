import {
  CanvasTextMetrics,
  Circle,
  Container,
  Geometry,
  Graphics,
  Mesh,
  Rectangle,
  Shader,
  BitmapText,
  Text,
  TextStyle,
  Texture,
  type TextStyleFontWeight,
  type TextureSource,
} from 'pixi.js'
import type { Node } from '@xenolith/core'
import type { XenTokens } from '@xenolith/theme-xen'
import {
  computeNodeLayout,
  markPinInteractive,
  renderWidgets,
  rerouteStateColor,
  resolveCategoryAccent,
  resolvePinFill,
  resolvePinStroke,
  type NodeView,
  type NodeVisualState,
  type RenderNodeOptions,
  type ThemeRenderContext,
  type WidgetHit,
} from '@xenolith/render-pixi'
import { glassFragmentGLSL, glassVertexGLSL } from './glass-shader.js'

/** Module-level registry of every live glass mesh so the theme's per-frame hook can broadcast
 *  `uBackdropSize` updates whenever the editor's backdrop RT is resized (window resize,
 *  embedded-showcase ResizeObserver, etc.). Without this the shader keeps using the size from
 *  construction time, refraction lands on the wrong texels, and you see the "phantom edges"
 *  artifact in any embedded canvas. */
interface GlassMeshEntry {
  shader: Shader
  nodeId: string
}
const liveGlassMeshes = new Set<GlassMeshEntry>()
const meshesByNode = new Map<string, Set<GlassMeshEntry>>()

export function syncLiquidGlassBackdropSize(w: number, h: number): void {
  for (const entry of liveGlassMeshes) {
    const group = entry.shader.resources['glassUniforms']
    if (!group) continue
    const arr = group.uniforms.uBackdropSize as Float32Array
    if (arr && arr[0] === w && arr[1] === h) continue
    group.uniforms.uBackdropSize = new Float32Array([w, h])
  }
}

/** Editor's painter's-order pass calls this per overlapping node to swap that node's mesh
 *  shader resources to point at the freshly rendered personal backdrop. `source = null` reverts
 *  to whatever the per-frame `onFrame` hook would otherwise sync (shared backdrop). */
export function syncLiquidGlassBackdropTexture(
  nodeId: string,
  source: TextureSource | null,
): void {
  const set = meshesByNode.get(nodeId)
  if (!set) return
  for (const entry of set) {
    entry.shader.resources['uBackdropTex'] = source ?? Texture.WHITE.source
    if (source) {
      const group = entry.shader.resources['glassUniforms']
      if (group) {
        const arr = group.uniforms.uBackdropSize as Float32Array
        if (!arr || arr[0] !== source.width || arr[1] !== source.height) {
          group.uniforms.uBackdropSize = new Float32Array([source.width, source.height])
        }
      }
    }
  }
}


/** Build one glass-material mesh sized to (w, h). The fragment shader samples
 *  `ctx.backdropTexture` (a per-frame snapshot of the world minus nodes) via screen UV, with
 *  refraction-offset taps, to give the body a real "see through frosted glass" feel. */
function createGlassMesh(
  nodeId: string,
  w: number,
  h: number,
  radius: number,
  _tokens: XenTokens,
  backdropTexture: TextureSource | null,
): Mesh<Geometry, Shader> {
  const geometry = new Geometry({
    attributes: {
      aPosition: [0, 0, w, 0, w, h, 0, h],
    },
    indexBuffer: [0, 1, 2, 0, 2, 3],
  })

  // Backdrop texture must be a Texture instance (not raw TextureSource) for PIXI's resource
  // binding to wrap it correctly. Fall back to white pixel if no backdrop is available yet.
  const backdrop = backdropTexture
    ? new Texture({ source: backdropTexture })
    : Texture.WHITE
  const bdWidth  = backdropTexture ? backdropTexture.width  : 1
  const bdHeight = backdropTexture ? backdropTexture.height : 1

  // dashersw/liquid-glass-js defaults (their tuned values from container.js):
  //   blurRadius: 5.0, edgeIntensity: 0.01, rimIntensity: 0.05, baseIntensity: 0.01,
  //   edgeDistance: 0.15, rimDistance: 0.8, baseDistance: 0.1, cornerBoost: 0.02,
  //   rippleEffect: 0.1, tintOpacity: 0.2, warp: 0 (off)
  const shader = Shader.from({
    gl: { vertex: glassVertexGLSL, fragment: glassFragmentGLSL },
    resources: {
      uBackdropTex: backdrop.source,
      glassUniforms: {
        uSize:         { value: new Float32Array([w, h]),              type: 'vec2<f32>' },
        uBorderRadius: { value: radius,                                type: 'f32' },
        uBackdropSize: { value: new Float32Array([bdWidth, bdHeight]), type: 'vec2<f32>' },
        uBlurRadius:    { value: 5.0,    type: 'f32' },
        uEdgeIntensity: { value: 0.01,   type: 'f32' },
        uRimIntensity:  { value: 0.05,   type: 'f32' },
        uBaseIntensity: { value: 0.01,   type: 'f32' },
        uEdgeDistance:  { value: 0.15,   type: 'f32' },
        uRimDistance:   { value: 0.8,    type: 'f32' },
        uBaseDistance:  { value: 0.1,    type: 'f32' },
        uCornerBoost:   { value: 0.02,   type: 'f32' },
        uRippleEffect:  { value: 0.1,    type: 'f32' },
        uTintOpacity:   { value: 0.2,    type: 'f32' },
        uWarp:          { value: 0.0,    type: 'f32' },
      },
    },
  })

  const mesh = new Mesh<Geometry, Shader>({ geometry, shader })
  mesh.label = `liquid-glass-${w}x${h}`
  mesh.eventMode = 'static'
  mesh.cursor = 'pointer'
  mesh.hitArea = new Rectangle(0, 0, w, h)

  const entry: GlassMeshEntry = { shader, nodeId }
  liveGlassMeshes.add(entry)
  let nodeSet = meshesByNode.get(nodeId)
  if (!nodeSet) {
    nodeSet = new Set()
    meshesByNode.set(nodeId, nodeSet)
  }
  nodeSet.add(entry)
  mesh.on('destroyed', () => {
    liveGlassMeshes.delete(entry)
    const s = meshesByNode.get(nodeId)
    if (s) {
      s.delete(entry)
      if (s.size === 0) meshesByNode.delete(nodeId)
    }
  })
  return mesh
}

export function renderNodeLiquidGlass(
  node: Node,
  tokens: XenTokens,
  opts: RenderNodeOptions = {},
  ctx: ThemeRenderContext = { backdropTexture: null },
): NodeView {
  const geo = tokens.geometry
  const layout = computeNodeLayout(node, {
    node: {
      minWidth:      geo.node.minWidth,
      headerHeight:  geo.node.headerHeight,
      headerPadding: geo.node.headerPadding,
      innerPaddingX: geo.node.innerPaddingX,
      innerPaddingY: geo.node.innerPaddingY,
    },
    pin: {
      diameter:   geo.pin.diameter,
      rowSpacing: geo.pin.rowSpacing,
      rowHeight:  geo.pin.rowHeight,
    },
    header: { toPinsGap: geo.header.toPinsGap },
  })
  const expandedW = layout.body.width
  const expandedH = layout.body.height
  const expandedRadius = geo.node.radius
  const pillH = geo.node.pillHeight
  const pillR = geo.node.pillRadius
  // Pill width must fit the title (it sits at x=34) plus a trailing cap, not a fixed minimum —
  // otherwise long titles like "Workflow Information" overflow the capsule.
  const titleText = opts.title ?? node.type
  const titleW = CanvasTextMetrics.measureText(
    titleText,
    new TextStyle({ fontFamily: tokens.typography.fontFamily, fontSize: tokens.typography.heading.size, fontWeight: '700' }),
  ).width
  const pillW = Math.max(geo.node.pillMinWidth, 34 + titleW + pillR)
  // Xen canon: pill is vertically centred within the expanded body's bounds when collapsed.
  // Canon: collapse UP to the header (pill at top), not to the vertical centre.
  const pillOffsetY = 0

  const container = new Container({ label: `node-liquid-glass:${node.id}` })
  container.position.set(node.position.x, node.position.y)
  container.eventMode = 'static'

  // ===== Two body meshes — expanded (full size) and pill (compact, vertically centred) =======
  const nodeIdStr = String(node.id)
  const expandedBody = createGlassMesh(nodeIdStr, expandedW, expandedH, expandedRadius, tokens, ctx.backdropTexture)
  const pillBody = createGlassMesh(nodeIdStr, pillW, pillH, pillR, tokens, ctx.backdropTexture)
  pillBody.position.set(0, pillOffsetY)
  container.addChild(expandedBody)
  container.addChild(pillBody)
  // Clip each glass mesh to its exact rounded-rect silhouette. The shader's rounded-rect AA can
  // leave the quad corners faintly square ("clipped" look); a hard mask guarantees crisp rounded
  // corners — same fix proven on the reroute knots.
  const expandedMask = new Graphics().roundRect(0, 0, expandedW, expandedH, expandedRadius).fill({ color: 0xffffff })
  container.addChild(expandedMask)
  expandedBody.mask = expandedMask
  const pillMask = new Graphics().roundRect(0, pillOffsetY, pillW, pillH, pillR).fill({ color: 0xffffff })
  container.addChild(pillMask)
  pillBody.mask = pillMask

  // ===== Inner content (header tint + pin labels + chevron+title for expanded form) ==========
  const expandedInner = new Container({ label: 'expanded-inner' })
  container.addChild(expandedInner)

  const accent = resolveCategoryAccent(opts.category, tokens)
  const headerHeight = geo.node.headerHeight
  const headerRadius = Math.max(0, geo.node.radius - 1)
  const headerTint = new Graphics()
    .roundRect(2, 2, expandedW - 4, headerHeight - 1, headerRadius)
    .fill({ color: accent, alpha: 0.45 })
  expandedInner.addChild(headerTint)

  // Collapsed pill carries the category accent across its whole body (the glass alone reads as
  // "some node" — this is the type cue, mirroring the header tint of the expanded form). Only
  // visible in pill form; sits above the glass, below the pill title.
  const pillTint = new Graphics()
    .roundRect(0, pillOffsetY, pillW, pillH, pillR)
    .fill({ color: accent, alpha: 0.4 })
  pillTint.visible = false
  container.addChild(pillTint)

  const title = new BitmapText({
    text: titleText,
    style: {
      fontFamily: tokens.typography.fontFamily,
      fontSize:   tokens.typography.heading.size,
      fontWeight: '700' as TextStyleFontWeight,
      fill:       '#FFFFFF',
    },
  })
  title.position.set(geo.node.headerPadding + 8 + geo.header.chevronSize / 2 + geo.header.titleGap, 4)
  expandedInner.addChild(title)

  // ===== Pill title — separate label only visible in collapsed form =========================
  const pillTitle = new BitmapText({
    text: titleText,
    style: {
      fontFamily: tokens.typography.fontFamily,
      fontSize:   tokens.typography.heading.size,
      fontWeight: '700' as TextStyleFontWeight,
      fill:       '#FFFFFF',
    },
  })
  pillTitle.position.set(34, pillOffsetY + (pillH - tokens.typography.heading.lineHeight) / 2)
  pillTitle.visible = false
  container.addChild(pillTitle)

  // ===== Chevron (toggle button) — drawn at origin, positioned per form. Matches Xen's
  // `buildChevron` proportions (halfW = size*0.22, halfH = size*0.11) for a thin, crisp ‘v’.
  const chevron = new Graphics()
  const cs = geo.header.chevronSize
  const chevronHalfW = cs * 0.22
  const chevronHalfH = cs * 0.11
  chevron
    .moveTo(-chevronHalfW, -chevronHalfH)
    .lineTo(0,              chevronHalfH)
    .lineTo( chevronHalfW, -chevronHalfH)
    .stroke({ color: '#FFFFFF', width: 1.2, cap: 'round', join: 'round' })
  chevron.cursor = 'pointer'
  chevron.eventMode = 'static'
  chevron.hitArea = {
    contains: (px, py) => Math.abs(px) <= cs / 2 && Math.abs(py) <= cs / 2,
  }
  container.addChild(chevron)

  // ===== Pins + labels — built for expanded form; rebuilt on form change =====================
  const expandedPinPositions = new Map<string, { x: number; y: number }>()
  const pinGraphics: Graphics[] = []
  for (const pin of node.pins) {
    const layoutPin = layout.pins.find((p) => p.id === pin.id)
    if (!layoutPin) continue
    const localX = layoutPin.x - node.position.x
    const localY = layoutPin.y - node.position.y
    expandedPinPositions.set(pin.id, { x: localX, y: localY })

    const r = geo.pin.diameter / 2
    const g = new Graphics()
      .circle(localX, localY, r)
      .fill({ color: resolvePinFill(String(pin.type), tokens) })
      .stroke({ color: resolvePinStroke(String(pin.type), tokens), width: geo.pin.stroke })
    markPinInteractive(g, pin, String(node.id), localX, localY, r)
    pinGraphics.push(g)
    container.addChild(g)

    if (pin.label) {
      const lab = new BitmapText({
        text: pin.label,
        style: {
          fontFamily: tokens.typography.fontFamily,
          fontSize:   tokens.typography.label.size,
          fontWeight: String(tokens.typography.label.weight) as TextStyleFontWeight,
          fill:       'rgba(255, 255, 255, 0.95)',
        },
      })
      if (layoutPin.side === 'left') {
        lab.anchor.set(0, 0.5)
        lab.position.set(localX + r + geo.pin.labelGap, localY)
      } else {
        lab.anchor.set(1, 0.5)
        lab.position.set(localX - r - geo.pin.labelGap, localY)
      }
      expandedInner.addChild(lab)
    }
  }

  // ===== Pill pin positions (computed once; applied on collapse) ============================
  const pillPinPositions = computePillPinPositions(node, pillW, pillH, pillR, pillOffsetY)

  // ===== Selection / hover ring =============================================================
  const selectionRim = new Graphics()
  selectionRim.alpha = 0
  container.addChild(selectionRim)

  let visualState: NodeVisualState = opts.state ?? 'default'
  const applyVisualState = () => {
    switch (visualState) {
      case 'hover':    selectionRim.tint = 0xFFFFFF; selectionRim.alpha = 0.45; break
      case 'selected': selectionRim.tint = 0xFFFFFF; selectionRim.alpha = 0.85; break
      case 'active':   selectionRim.tint = 0xFFDF67; selectionRim.alpha = 0.95; break
      default:         selectionRim.alpha = 0
    }
  }

  // ===== Form swap (expanded ↔ pill) =========================================================
  let collapsed = !!opts.collapsed

  function rebuildPinGeometry(positions: Map<string, { x: number; y: number }>): void {
    let i = 0
    for (const pin of node.pins) {
      const pos = positions.get(pin.id)
      if (!pos) continue
      const g = pinGraphics[i++]
      if (!g) continue
      const r = geo.pin.diameter / 2
      g.clear()
        .circle(pos.x, pos.y, r)
        .fill({ color: resolvePinFill(String(pin.type), tokens) })
        .stroke({ color: resolvePinStroke(String(pin.type), tokens), width: geo.pin.stroke })
      markPinInteractive(g, pin, String(node.id), pos.x, pos.y, r)
    }
  }

  function applyForm(c: boolean): void {
    if (c) {
      expandedBody.visible = false
      pillBody.visible = true
      expandedInner.visible = false
      pillTitle.visible = true
      pillTint.visible = true
      selectionRim.clear()
        .roundRect(0, pillOffsetY, pillW, pillH, pillR)
        .stroke({ color: '#FFFFFF', width: 1.5, alignment: 0.5 })
      rebuildPinGeometry(pillPinPositions)
      chevron.rotation = -Math.PI / 2
      chevron.position.set(18, pillOffsetY + pillH / 2)
    } else {
      expandedBody.visible = true
      pillBody.visible = false
      expandedInner.visible = true
      pillTitle.visible = false
      pillTint.visible = false
      selectionRim.clear()
        .roundRect(0, 0, expandedW, expandedH, expandedRadius)
        .stroke({ color: '#FFFFFF', width: 1.5, alignment: 0.5 })
      rebuildPinGeometry(expandedPinPositions)
      chevron.rotation = 0
      chevron.position.set(geo.node.headerPadding + 8 + cs / 2 - 4, 2 + headerHeight / 2 - 0.5)
    }
    applyVisualState()
  }

  chevron.on('pointerdown', (e) => {
    collapsed = !collapsed
    applyForm(collapsed)
    e.stopPropagation()
  })

  // Widget rows (expanded form only) — reuse the shared renderer; LG inherits widget tokens.
  const widgetsView =
    node.widgets && node.widgets.length > 0
      ? renderWidgets(node, expandedW, tokens, {
          node:   { headerHeight: geo.node.headerHeight },
          pin:    { rowSpacing: geo.pin.rowSpacing, rowHeight: geo.pin.rowHeight },
          header: { toPinsGap: geo.header.toPinsGap },
          widget: { rowHeight: geo.widget.rowHeight, gap: geo.widget.gap, paddingX: geo.widget.paddingX },
        }, opts.customWidgets)
      : null
  if (widgetsView) expandedInner.addChild(widgetsView.container)

  applyForm(collapsed)

  const view: NodeView = {
    container,
    setVisualState(state) {
      visualState = state
      applyVisualState()
    },
    setCollapsed(c, _animated) {
      if (c === collapsed) return
      collapsed = c
      applyForm(collapsed)
    },
    isCollapsed() { return collapsed },
    pinLocalPosition(pinId) {
      return (collapsed ? pillPinPositions : expandedPinPositions).get(pinId) ?? null
    },
    collapsedRect: { x: 0, y: pillOffsetY, w: pillW, h: pillH, r: pillR },
  }
  if (widgetsView) {
    view.widgetHit = (x, y): WidgetHit | null => (collapsed ? null : widgetsView.widgetHit(x, y))
    view.updateWidget = (id, value): void => widgetsView.update(id, value)
  }
  return view
}

/** Liquid Glass reroute knot — a glass disc. The glass shader draws a rounded rect; with a square
 *  the size of the dot and a corner radius equal to half its side, that rounded rect is a perfect
 *  circle that refracts the backdrop just like a full node. */
export function renderRerouteLiquidGlass(
  node: Node,
  tokens: XenTokens,
  opts: RenderNodeOptions = {},
  ctx: ThemeRenderContext = { backdropTexture: null },
): NodeView {
  const r = tokens.geometry.reroute.radius
  const d = 2 * r
  const cy = r

  const container = new Container({ label: `reroute-liquid-glass:${node.id}` })
  container.position.set(node.position.x, node.position.y)
  container.eventMode = 'static'

  const disc = createGlassMesh(String(node.id), d, d, r, tokens, ctx.backdropTexture)
  disc.hitArea = new Circle(r, r, r)
  container.addChild(disc)
  // Clip the glass mesh to a hard circle so the knot is unambiguously round (the shader's
  // rounded-rect AA can leave the quad corners faintly visible at this small size).
  const discMask = new Graphics().circle(r, r, r).fill({ color: 0xffffff })
  container.addChild(discMask)
  disc.mask = discMask

  const outPin = node.pins.find((p) => p.direction === 'out')
  const inPin = node.pins.find((p) => p.direction === 'in')
  const wireType = String(outPin?.type ?? inPin?.type ?? 'any')
  // Tint the whole glass disc with a soft type-coloured fill — the same treatment a collapsed node
  // gets (a wash over the glass, not a bright inner ring), so the knot reads as glass first and its
  // wire type second. Clipped to the same circle so it never bleeds past the disc edge.
  const tint = new Graphics()
    .circle(r, r, r)
    .fill({ color: resolvePinFill(wireType, tokens), alpha: 0.4 })
  container.addChild(tint)

  const rim = new Graphics()
    .circle(r, r, r + 1)
    .stroke({ color: 0xffffff, width: 1.5, alignment: 0.5 })
  rim.alpha = 0
  container.addChild(rim)

  // Inline reroute: anchor points only, no interactive (pullable) pin handles — the glass disc
  // body stays the grab target and new wires can't be started from the knot.
  const pinLocal = new Map<string, { x: number; y: number }>()
  for (const pin of node.pins) {
    pinLocal.set(String(pin.id), { x: pin.direction === 'in' ? 0 : d, y: cy })
  }

  return {
    container,
    setVisualState(state) {
      const c = rerouteStateColor(state, tokens)
      if (!c) { rim.alpha = 0; return }
      rim.tint = c
      rim.alpha = state === 'hover' ? 0.6 : 0.95
    },
    setCollapsed: () => {},
    isCollapsed: () => false,
    pinLocalPosition: (pinId) => pinLocal.get(pinId) ?? null,
  }
}

/** Liquid Glass palette Reroute node — a compact glass body with pullable In/Out pins. Mirrors the
 *  Xen `renderRerouteNodeBox` but with the glass material. */
export function renderRerouteNodeBoxLiquidGlass(
  node: Node,
  tokens: XenTokens,
  opts: RenderNodeOptions = {},
  ctx: ThemeRenderContext = { backdropTexture: null },
): NodeView {
  const h = tokens.geometry.pin.diameter + 16
  const w = 56
  const radius = Math.min(tokens.geometry.node.radius, h / 2)
  const cy = h / 2

  const container = new Container({ label: `reroute-node-liquid-glass:${node.id}` })
  container.position.set(node.position.x, node.position.y)
  container.eventMode = 'static'

  const body = createGlassMesh(String(node.id), w, h, radius, tokens, ctx.backdropTexture)
  body.hitArea = new Rectangle(0, 0, w, h)
  container.addChild(body)
  const bodyMask = new Graphics().roundRect(0, 0, w, h, radius).fill({ color: 0xffffff })
  container.addChild(bodyMask)
  body.mask = bodyMask

  // Tint the glass relay by the type flowing through it (resolved from the out pin, falling back to
  // the in pin) — the same soft wash the inline knot and collapsed pills carry. Itself a rounded
  // rect of the body shape, so it stays within the glass edge without a shared mask.
  const inPin = node.pins.find((p) => p.direction === 'in')
  const outPin = node.pins.find((p) => p.direction === 'out')
  const wireType = String(outPin?.type ?? inPin?.type ?? 'any')
  container.addChild(
    new Graphics().roundRect(0, 0, w, h, radius).fill({ color: resolvePinFill(wireType, tokens), alpha: 0.4 }),
  )

  const rim = new Graphics()
    .roundRect(-1, -1, w + 2, h + 2, radius + 1)
    .stroke({ color: 0xffffff, width: 1.5, alignment: 0.5 })
  rim.alpha = 0
  container.addChild(rim)

  const pinLocal = new Map<string, { x: number; y: number }>()
  const pinRadius = tokens.geometry.pin.diameter / 2
  for (const pin of node.pins) {
    const px = pin.direction === 'in' ? 0 : w
    pinLocal.set(String(pin.id), { x: px, y: cy })
    const g = new Graphics()
      .circle(px, cy, pinRadius)
      .fill({ color: resolvePinFill(String(pin.type), tokens) })
      .stroke({ color: resolvePinStroke(String(pin.type), tokens), width: tokens.geometry.pin.stroke })
    markPinInteractive(g, pin, String(node.id), px, cy, pinRadius)
    container.addChild(g)
  }

  return {
    container,
    setVisualState(state) {
      const c = rerouteStateColor(state, tokens)
      if (!c) { rim.alpha = 0; return }
      rim.tint = c
      rim.alpha = state === 'hover' ? 0.6 : 0.95
    },
    setCollapsed: () => {},
    isCollapsed: () => false,
    pinLocalPosition: (pinId) => pinLocal.get(pinId) ?? null,
  }
}

/** Distribute pins onto the rounded end-caps of the pill so each sits on the silhouette, in
 *  container-local coordinates. The pill is offset vertically by `pillOffsetY` to centre it
 *  within the original expanded body's bounds (Xen canon — collapse to centre, not to header). */
function computePillPinPositions(
  node: Node,
  pillW: number,
  pillH: number,
  pillR: number,
  pillOffsetY: number,
): Map<string, { x: number; y: number }> {
  const inputs  = node.pins.filter((p) => p.direction === 'in')
  const outputs = node.pins.filter((p) => p.direction === 'out')
  const out = new Map<string, { x: number; y: number }>()
  const cy = pillOffsetY + pillH / 2

  const idealStep = Math.PI / 3.6
  const maxTotal = Math.PI * 0.94
  const arcAngle = (count: number, idx: number): number => {
    if (count <= 1) return 0
    const total = Math.min(maxTotal, (count - 1) * idealStep)
    const step = total / (count - 1)
    return -total / 2 + idx * step
  }

  inputs.forEach((p, i) => {
    const a = arcAngle(inputs.length, i)
    out.set(p.id, { x: pillR - pillR * Math.cos(a), y: cy + pillR * Math.sin(a) })
  })
  outputs.forEach((p, i) => {
    const a = arcAngle(outputs.length, i)
    out.set(p.id, { x: pillW - pillR + pillR * Math.cos(a), y: cy + pillR * Math.sin(a) })
  })
  return out
}
