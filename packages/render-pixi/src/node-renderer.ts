import { Container, FillGradient, Graphics, Text } from 'pixi.js'
import type { Node } from '@xenolith/core'
import type { XenTokens } from '@xenolith/theme-xen'
import { computeNodeLayout } from './layout.js'
import { resolveCategoryGradient, resolvePinFill, resolvePinStroke } from './style.js'

/**
 * Draw a top-rounded rectangle: top-left and top-right corners are arcs of radius `r`,
 * bottom edge is a straight line across. Used for the node header so its bottom edge meets
 * the body cleanly instead of bowing inward.
 */
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

/** Open path that traces only the top edge (rounded corners + straight top). Stroke this with a
 *  vertical white-to-transparent gradient to get the Figma rim-light effect. */
function buildTopRimPath(g: Graphics, x: number, y: number, w: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2))
  return g
    .moveTo(x, y + radius)
    .arcTo(x, y, x + radius, y, radius)
    .lineTo(x + w - radius, y)
    .arcTo(x + w, y, x + w, y + radius, radius)
}

/** Downward chevron `∨` inside a `size`×`size` box centred at (cx, cy). */
function buildChevron(g: Graphics, cx: number, cy: number, size: number) {
  const halfW = size * 0.22
  const halfH = size * 0.11
  return g
    .moveTo(cx - halfW, cy - halfH)
    .lineTo(cx, cy + halfH)
    .lineTo(cx + halfW, cy - halfH)
}

export interface RenderNodeOptions {
  /** Visual category for the header accent. Defaults to 'utility'. */
  category?: string
  /** Title shown in the header. Defaults to node.type. */
  title?: string
}

export function renderNode(node: Node, tokens: XenTokens, opts: RenderNodeOptions = {}): Container {
  const geo = tokens.geometry
  const layout = computeNodeLayout(node, {
    node:   geo.node,
    pin:    { diameter: geo.pin.diameter, rowSpacing: geo.pin.rowSpacing, rowHeight: geo.pin.rowHeight },
    header: { toPinsGap: geo.header.toPinsGap },
  })

  const container = new Container()
  container.position.set(node.position.x, node.position.y)

  const w = layout.body.width
  const h = layout.body.height

  const body = new Graphics()
    .roundRect(0, 0, w, h, geo.node.radius)
    .fill({ color: tokens.color.surface.node })
  container.addChild(body)

  const padding = geo.node.headerPadding
  const headerInnerWidth = w - padding * 2
  const headerInnerHeight = geo.node.headerHeight - padding
  const headerRadius = Math.max(geo.node.radius - 2, 0)

  const gradient = resolveCategoryGradient(opts.category, tokens)
  // PIXI v8 FillGradient with textureSpace: 'local' normalizes 0..1 to the shape's bounding box.
  // Horizontal axis: left edge (start of category accent at 0.6 alpha) to right edge (same accent
  // fading to alpha 0, blending into the body underneath).
  const headerFill = new FillGradient({
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
  buildTopRoundedRect(
    headerInner,
    padding,
    padding,
    headerInnerWidth,
    headerInnerHeight,
    headerRadius,
  ).fill(headerFill)
  container.addChild(headerInner)

  // Figma: `inset 0 3px 6px rgba(255, 255, 255, 0.5)`. The 0.5 is calibrated for a page with
  // `backdrop-filter: blur(4px)`; without that softening we render at lower intensity, otherwise
  // the white wash competes with the category gradient on the right side.
  const highlightAlpha = 0.25
  const fadeStop = Math.min(
    1,
    (tokens.effect.headerInnerShadow.blur + tokens.effect.headerInnerShadow.offsetY) /
      headerInnerHeight,
  )
  const highlightFill = new FillGradient({
    type: 'linear',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 1 },
    colorStops: [
      { offset: 0, color: `rgba(255, 255, 255, ${highlightAlpha})` },
      { offset: fadeStop, color: 'rgba(255, 255, 255, 0)' },
    ],
    textureSpace: 'local',
  })

  const headerHighlight = new Graphics()
  buildTopRoundedRect(
    headerHighlight,
    padding,
    padding,
    headerInnerWidth,
    headerInnerHeight,
    headerRadius,
  ).fill(highlightFill)
  container.addChild(headerHighlight)

  // Top rim light: thin white→transparent gradient stroke along the top curved edge only.
  // Matches the Figma `<path ... stroke="url(#paint1_linear)" stroke-width="0.5"/>` element.
  const rimGradient = new FillGradient({
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
  container.addChild(headerRim)

  // Chevron icon (downward V) on the left of the header title.
  const chevronY = padding + geo.node.headerHeight / 2 - 0.5
  const chevronCenterX = padding + 8 + geo.header.chevronSize / 2 - 4
  const chevron = new Graphics()
  buildChevron(chevron, chevronCenterX, chevronY, geo.header.chevronSize).stroke({
    color: tokens.color.text.primary,
    width: 1,
    cap: 'round',
    join: 'round',
  })
  container.addChild(chevron)

  const title = new Text({
    text: opts.title ?? node.type,
    style: {
      fontFamily: tokens.typography.fontFamily,
      fontSize:   tokens.typography.heading.size,
      fontWeight: '700',
      fill:       tokens.typography.heading.color,
    },
  })
  title.position.set(chevronCenterX + geo.header.chevronSize / 2 + geo.header.titleGap, 3)
  container.addChild(title)

  for (const pin of node.pins) {
    const layoutPin = layout.pins.find((p) => p.id === pin.id)
    if (!layoutPin) continue
    const localX = layoutPin.x - node.position.x
    const localY = layoutPin.y - node.position.y
    const radius = geo.pin.diameter / 2
    const fill = resolvePinFill(String(pin.type), tokens)
    const stroke = resolvePinStroke(String(pin.type), tokens)

    const pinGfx = new Graphics().circle(localX, localY, radius)
    if (fill !== null) pinGfx.fill({ color: fill })
    pinGfx.stroke({ color: stroke, width: geo.pin.stroke })
    container.addChild(pinGfx)
  }

  return container
}
