import { Container, Graphics, Text } from 'pixi.js'
import type { Node } from '@xenolith/core'
import type { XenTokens } from '@xenolith/theme-xen'
import { computeNodeLayout } from './layout.js'
import { resolveCategoryAccent, resolvePinFill, resolvePinStroke } from './style.js'

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

  const accent = resolveCategoryAccent(opts.category, tokens)
  const padding = geo.node.headerPadding
  const headerInner = new Graphics()
    .roundRect(
      padding,
      padding,
      w - padding * 2,
      geo.node.headerHeight - padding,
      Math.max(geo.node.radius - 2, 0),
    )
    .fill({ color: accent, alpha: 0.6 })
  container.addChild(headerInner)

  const title = new Text({
    text: opts.title ?? node.type,
    style: {
      fontFamily: tokens.typography.fontFamily,
      fontSize:   tokens.typography.heading.size,
      fontWeight: '700',
      fill:       tokens.typography.heading.color,
    },
  })
  title.position.set(geo.header.chevronSize + geo.header.titleGap + 6, 3)
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
