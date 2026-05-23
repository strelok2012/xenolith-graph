import {
  Container,
  Geometry,
  Graphics,
  Mesh,
  Rectangle,
  Shader,
  Text,
  Texture,
  type TextStyleFontWeight,
  type TextureSource,
} from 'pixi.js'
import type { Node } from '@xenolith/core'
import type { XenTokens } from '@xenolith/theme-xen'
import {
  computeNodeLayout,
  markPinInteractive,
  resolveCategoryAccent,
  resolvePinFill,
  resolvePinStroke,
  type NodeView,
  type NodeVisualState,
  type RenderNodeOptions,
  type ThemeRenderContext,
} from '@xenolith/render-pixi'
import { glassFragmentGLSL, glassVertexGLSL } from './glass-shader.js'


/** Build one glass-material mesh sized to (w, h). The fragment shader samples
 *  `ctx.backdropTexture` (a per-frame snapshot of the world minus nodes) via screen UV, with
 *  refraction-offset taps, to give the body a real "see through frosted glass" feel. */
function createGlassMesh(
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
  const pillW = geo.node.pillMinWidth
  const pillH = geo.node.pillHeight
  const pillR = geo.node.pillRadius
  // Xen canon: pill is vertically centred within the expanded body's bounds when collapsed.
  const pillOffsetY = (expandedH - pillH) / 2

  const container = new Container({ label: `node-liquid-glass:${node.id}` })
  container.position.set(node.position.x, node.position.y)
  container.eventMode = 'static'

  // ===== Two body meshes — expanded (full size) and pill (compact, vertically centred) =======
  const expandedBody = createGlassMesh(expandedW, expandedH, expandedRadius, tokens, ctx.backdropTexture)
  const pillBody = createGlassMesh(pillW, pillH, pillR, tokens, ctx.backdropTexture)
  pillBody.position.set(0, pillOffsetY)
  container.addChild(expandedBody)
  container.addChild(pillBody)

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

  const titleText = opts.title ?? node.type
  const title = new Text({
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
  const pillTitle = new Text({
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
      const lab = new Text({
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

  applyForm(collapsed)

  return {
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
