import { Circle, Container, FillGradient, Graphics, Rectangle } from 'pixi.js'
import type { Node } from '@xenolith/core'
import type { XenTokens } from '@xenolith/theme-xen'
import { markPinInteractive } from './node-renderer.js'
import type { NodeView, NodeVisualState, RenderNodeOptions } from './node-renderer.js'
import { resolvePinFill, resolvePinStroke } from './style.js'

/** Selection/hover/active rim colour for the reroute knots, matching the theme's node state colours
 *  (gold hover, white selected, amber active) rather than a hardcoded white. */
export function rerouteStateColor(state: NodeVisualState, tokens: XenTokens): string | undefined {
  switch (state) {
    case 'hover':    return tokens.state.hover.border
    case 'selected': return tokens.state.selected.border
    case 'active':   return tokens.state.active.border
    default:         return undefined
  }
}

/** A reroute occupies a square the size of its dot so the editor's bounds/backdrop logic treats it
 *  uniformly with regular nodes. */
export function rerouteSize(tokens: XenTokens): { x: number; y: number } {
  const r = tokens.geometry.reroute.radius
  return { x: 2 * r, y: 2 * r }
}

/** Default Xen reroute: a node-surface-filled disc with a type-coloured rim. Wires enter on the
 *  left pin and exit on the right, flowing horizontally through the knot. No header, no collapse. */
export function renderRerouteNode(
  node: Node,
  tokens: XenTokens,
  opts: RenderNodeOptions = {},
): NodeView {
  const r = tokens.geometry.reroute.radius
  const ring = tokens.geometry.reroute.ringWidth
  const cx = r
  const cy = r

  const container = new Container({ label: `reroute:${node.id}` })
  container.position.set(node.position.x, node.position.y)
  container.eventMode = 'static'

  const inPin = node.pins.find((p) => p.direction === 'in')
  const outPin = node.pins.find((p) => p.direction === 'out')
  const wireType = String(outPin?.type ?? inPin?.type ?? 'any')
  const fill = resolvePinFill(wireType, tokens)

  // Body disc — node surface with a type-coloured rim so the knot reads as "a node carrying this
  // wire colour" rather than a bare pin.
  const body = new Graphics()
    .circle(cx, cy, r)
    .fill({ color: tokens.color.surface.node })
    .stroke({ color: fill, width: ring, alignment: 1 })
  // The disc body is the node's drag/select target. Pins only claim small caps at the left/right
  // edges (below), leaving the centre grabbable so the knot can be moved.
  body.eventMode = 'static'
  body.hitArea = new Circle(cx, cy, r)
  container.addChild(body)

  // Inner type-coloured core for a crisper read at small zoom.
  container.addChild(
    new Graphics().circle(cx, cy, Math.max(2, r - ring - 2)).fill({ color: fill, alpha: 0.28 }),
  )

  // Selection / hover ring.
  const rim = new Graphics()
    .circle(cx, cy, r + 1)
    .stroke({ color: 0xffffff, width: 1.5, alignment: 0.5 })
  rim.alpha = 0
  container.addChild(rim)

  // Pin anchor points only — wires enter on the left, exit on the right so they flow horizontally
  // through the knot. An inline reroute is NOT pullable: no interactive pin handles are created,
  // so the entire disc body stays grabbable for dragging and new wires can't be started from it.
  const pinLocal = new Map<string, { x: number; y: number }>()
  for (const pin of node.pins) {
    pinLocal.set(String(pin.id), { x: pin.direction === 'in' ? 0 : 2 * r, y: cy })
  }

  function setVisualState(state: NodeVisualState): void {
    const c = rerouteStateColor(state, tokens)
    if (!c) { rim.alpha = 0; return }
    rim.tint = c
    rim.alpha = state === 'hover' ? 0.6 : 0.95
  }
  setVisualState(opts.state ?? 'default')

  return {
    container,
    setVisualState,
    setCollapsed: () => {},
    isCollapsed: () => false,
    pinLocalPosition: (pinId) => pinLocal.get(pinId) ?? null,
  }
}

/** Size of the palette Reroute node — a compact headerless body, just wide enough for the in/out
 *  pins to sit on opposite edges. */
export function rerouteBoxSize(tokens: XenTokens): { x: number; y: number } {
  const h = tokens.geometry.pin.diameter + 16
  return { x: 56, y: h }
}

/** Palette Reroute node — a small headerless body with a pullable In pin on the left and Out pin
 *  on the right. Unlike the inline dot, its pins ARE interactive so users can wire freely. */
export function renderRerouteNodeBox(
  node: Node,
  tokens: XenTokens,
  opts: RenderNodeOptions = {},
): NodeView {
  const { x: w, y: h } = rerouteBoxSize(tokens)
  const radius = Math.min(tokens.geometry.node.radius, h / 2)
  const cy = h / 2

  const container = new Container({ label: `reroute-node:${node.id}` })
  container.position.set(node.position.x, node.position.y)
  container.eventMode = 'static'

  const body = new Graphics()
    .roundRect(0, 0, w, h, radius)
    .fill({ color: tokens.color.surface.node })
    .stroke({ color: tokens.geometry.pin.strokeColor, width: 1, alignment: 1 })
  body.eventMode = 'static'
  body.hitArea = new Rectangle(0, 0, w, h)
  container.addChild(body)

  // White top highlight, mirroring the header sheen on regular nodes so the box reads as the same
  // material rather than a flat slab. Gated on a real renderer — FillGradient needs a 2D canvas,
  // which headless unit tests don't have.
  if (opts.renderer) {
    const highlight = new FillGradient({
      type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
      colorStops: [
        { offset: 0,   color: 'rgba(255, 255, 255, 0.22)' },
        { offset: 0.6, color: 'rgba(255, 255, 255, 0)' },
      ],
      textureSpace: 'local',
    })
    container.addChild(new Graphics().roundRect(1, 1, w - 2, h - 2, Math.max(0, radius - 1)).fill(highlight))
  }

  // Thin bright top edge — the little white line regular nodes carry along their header rim.
  const topRim = new Graphics()
    .moveTo(1, radius)
    .arcTo(1, 1, 1 + radius, 1, radius)
    .lineTo(w - 1 - radius, 1)
    .arcTo(w - 1, 1, w - 1, 1 + radius, radius)
    .stroke({ color: 0xffffff, width: 1, alpha: 0.55 })
  container.addChild(topRim)

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

  function setVisualState(state: NodeVisualState): void {
    const c = rerouteStateColor(state, tokens)
    if (!c) { rim.alpha = 0; return }
    rim.tint = c
    rim.alpha = state === 'hover' ? 0.6 : 0.95
  }
  setVisualState(opts.state ?? 'default')

  return {
    container,
    setVisualState,
    setCollapsed: () => {},
    isCollapsed: () => false,
    pinLocalPosition: (pinId) => pinLocal.get(pinId) ?? null,
  }
}
