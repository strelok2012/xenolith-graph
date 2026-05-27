import { BitmapText, Color, Container, Graphics, FillGradient } from 'pixi.js'
import type { XenTokens } from '@xenolith/theme-xen'
import type { Comment } from '@xenolith/core'

export type CommentVisualState = 'default' | 'hover' | 'selected'

export interface CommentView {
  /** Body layer (translucent fill + border + resize grip). Hosted BELOW the edges so wires between
   *  the nodes inside the frame draw on top of the tint. */
  readonly container: Container
  /** Header layer (gradient/tint + rim + title + drag strip). Hosted ABOVE the edges so the header
   *  bar always reads clearly over any wires crossing the top of the frame. */
  readonly headerLayer: Container
  /** Header strip — interactive: drag to move, double-click to rename, right-click for the menu. */
  readonly header: Container
  /** Bottom-right resize grip — interactive. */
  readonly resizeHandle: Container
  readonly headerHeight: number
  update(comment: Comment): void
  setVisualState(state: CommentVisualState): void
  /** Hide the baked title while a DOM edit overlay is open over the header (so text doesn't double up). */
  setEditing(editing: boolean): void
  /** LOD: when true, draw the frame as a plain filled rectangle (body + border only) — header
   *  gradient/rim and the title are dropped, since at a far zoom they're sub-pixel anyway. */
  setSimplified(simplified: boolean): void
  /** Free both layers AND the FillGradient GPU textures (Graphics.destroy doesn't touch the
   *  gradients — they leak otherwise). Always use this instead of destroying the containers directly. */
  destroy(): void
}

const DEFAULT_COLOR = '#8A38F5'
const HANDLE = 14

const rgba = (color: string, a: number): string => {
  const c = new Color(color)
  return `rgba(${Math.round(c.red * 255)}, ${Math.round(c.green * 255)}, ${Math.round(c.blue * 255)}, ${a})`
}

// Same header silhouette helpers the node renderer uses, so a comment header reads 1:1 with a node.
function topRoundedRect(g: Graphics, w: number, h: number, r: number): Graphics {
  const radius = Math.max(0, Math.min(r, w / 2, h))
  return g.moveTo(radius, 0).lineTo(w - radius, 0).arcTo(w, 0, w, radius, radius)
    .lineTo(w, h).lineTo(0, h).lineTo(0, radius).arcTo(0, 0, radius, 0, radius).closePath()
}
function topRimPath(g: Graphics, w: number, r: number): Graphics {
  const radius = Math.max(0, Math.min(r, w / 2))
  return g.moveTo(0, radius).arcTo(0, 0, radius, 0, radius).lineTo(w - radius, 0).arcTo(w, 0, w, radius, radius)
}

/**
 * Comment/group frame. Body is a translucent tinted rounded rect; the header is rendered like a node
 * header — colour gradient + a soft white top highlight + a bright rim line — so it matches the Xen
 * node language exactly. Sits below the nodes; body is non-interactive (clicks reach nodes inside),
 * only the header strip and corner grip capture pointer events. Hover/selected brighten the border.
 */
export function renderComment(comment: Comment, tokens: XenTokens, headerStyle: 'gradient' | 'tint' = 'gradient'): CommentView {
  const geo = tokens.geometry.comment
  const typo = tokens.typography.comment
  const headerHeight = geo.headerHeight
  // Default to the node corner radius so a comment frame reads 1:1 with a node header in any theme
  // (Xen 7 / Liquid Glass 14); a theme that sets comment.radius overrides this.
  const radius = geo.radius ?? tokens.geometry.node.radius

  const container = new Container({ label: `comment:${comment.id}` })
  const headerLayer = new Container({ label: `comment-header-layer:${comment.id}` })
  const body = new Graphics(); body.eventMode = 'none'
  const headerBase = new Graphics(); headerBase.eventMode = 'none'
  const headerFillG = new Graphics(); headerFillG.eventMode = 'none'
  const headerHighlight = new Graphics(); headerHighlight.eventMode = 'none'
  const headerRim = new Graphics(); headerRim.eventMode = 'none'
  const border = new Graphics(); border.eventMode = 'none'

  const header = new Container({ label: 'comment-header' })
  header.eventMode = 'static'
  header.cursor = 'move'
  const headerHit = new Graphics(); headerHit.eventMode = 'static'
  header.addChild(headerHit)

  const title = new BitmapText({
    text: comment.text,
    style: { fontFamily: tokens.typography.fontFamily, fontSize: typo.size, fontWeight: '700' as never, fill: typo.color },
  })
  title.eventMode = 'none'
  // Anchor the title at its vertical centre and place it at the header's mid-line, so it sits at the
  // exact same centre the DOM edit input uses (line-box = header height) — no jump entering edit mode.
  title.anchor.set(0, 0.5)
  title.x = 10
  title.y = headerHeight / 2

  const resizeHandle = new Container({ label: 'comment-resize' })
  resizeHandle.eventMode = 'static'
  resizeHandle.cursor = 'nwse-resize'
  const handleGfx = new Graphics(); handleGfx.eventMode = 'static'
  resizeHandle.addChild(handleGfx)

  // Body layer (under edges): fill + border + resize grip. Header layer (over edges): the header bar
  // visuals + the interactive drag strip + the title — so the header reads over crossing wires.
  container.addChild(body, border, resizeHandle)
  headerLayer.addChild(headerBase, headerFillG, headerHighlight, headerRim, header, title)

  let current: Comment = comment
  let state: CommentVisualState = 'default'
  let editing = false
  let simplified = false

  // Truncate the title with an ellipsis when it overflows the header width — but show the full text
  // while editing (the caret can run past the frame; the user sees everything they type).
  const RIGHT_PAD = 10
  const fitTitle = (full: string, w: number): void => {
    title.text = full
    if (editing) return
    const maxW = w - title.x - RIGHT_PAD
    if (title.width <= maxW) return
    let s = full
    while (s.length > 1) {
      s = s.slice(0, -1)
      title.text = `${s}…`
      if (title.width <= maxW) break
    }
  }

  // Gradients are built once (not per draw) — `update` runs every frame during a resize drag, and a
  // fresh FillGradient each time leaks a GPU texture per frame. highlight/rim are colour-independent;
  // the header fill is rebuilt only when the comment colour actually changes.
  const highlightGrad = new FillGradient({
    type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
    colorStops: [{ offset: 0, color: 'rgba(255,255,255,0.25)' }, { offset: 0.6, color: 'rgba(255,255,255,0)' }], textureSpace: 'local',
  })
  const rimGrad = new FillGradient({
    type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
    colorStops: [{ offset: 0, color: 'rgba(255,255,255,0.8)' }, { offset: 1, color: 'rgba(255,255,255,0)' }], textureSpace: 'local',
  })
  const mkHeaderFill = (color: string): FillGradient => new FillGradient({
    // Node header recipe is a HORIZONTAL accent fade (left→right), accent@0.6 → transparent.
    type: 'linear', start: { x: 0, y: 0 }, end: { x: 1, y: 0 },
    colorStops: [{ offset: 0, color: rgba(color, 0.6) }, { offset: 1, color: rgba(color, 0) }], textureSpace: 'local',
  })
  let headerFill = mkHeaderFill(comment.color ?? DEFAULT_COLOR)
  let headerFillColor = comment.color ?? DEFAULT_COLOR

  const drawBorder = (): void => {
    const color = current.color ?? DEFAULT_COLOR
    const w = current.size.x, h = current.size.y
    border.clear()
    if (state === 'selected') {
      border.roundRect(0, 0, w, h, radius).stroke({ color: 0xffffff, width: 2, alpha: 0.95 })
    } else {
      border.roundRect(0, 0, w, h, radius).stroke({ color, width: state === 'hover' ? 2 : 1.5, alpha: state === 'hover' ? 0.85 : 0.55 })
    }
  }

  const draw = (c: Comment): void => {
    current = c
    const color = c.color ?? DEFAULT_COLOR
    const w = c.size.x, h = c.size.y
    // Translucent tinted body — the grid shows through; nodes inside paint on top.
    body.clear().roundRect(0, 0, w, h, radius).fill({ color: tokens.color.surface.node, alpha: 0.55 })
      .roundRect(0, 0, w, h, radius).fill({ color, alpha: 0.08 })
    headerBase.clear(); headerFillG.clear(); headerHighlight.clear(); headerRim.clear()
    container.position.set(c.position.x, c.position.y)
    headerLayer.position.set(c.position.x, c.position.y)
    if (simplified) {
      // LOD: plain block — a touch more body tint to read as a solid rectangle, no header decoration.
      body.roundRect(0, 0, w, h, radius).fill({ color, alpha: 0.12 })
      headerLayer.visible = false
      handleGfx.clear()
      drawBorder()
      return
    }
    headerLayer.visible = true
    if (headerStyle === 'tint') {
      // 1:1 with the Liquid Glass node header: an accent tint inset 2px from the body edges (so the
      // glass rim shows the small top/side gap), radius one less than the body corner.
      headerFillG.roundRect(2, 2, w - 4, headerHeight - 1, Math.max(0, radius - 1)).fill({ color, alpha: 0.45 })
    } else {
      // Xen node header recipe: dark base + horizontal accent fade + white highlight + top rim.
      topRoundedRect(headerBase, w, headerHeight, radius).fill({ color: tokens.color.surface.node })
      if (color !== headerFillColor) { headerFill.destroy(); headerFill = mkHeaderFill(color); headerFillColor = color }
      topRoundedRect(headerFillG, w, headerHeight, radius).fill(headerFill)
      topRoundedRect(headerHighlight, w, headerHeight, radius).fill(highlightGrad)
      topRimPath(headerRim, w, radius).stroke({ width: 0.75, fill: rimGrad, alignment: 0 })
    }
    headerHit.clear().rect(0, 0, w, headerHeight).fill({ color: 0xffffff, alpha: 0.001 })
    handleGfx.clear()
      .moveTo(w - 3, h - HANDLE).lineTo(w - 3, h - 3).lineTo(w - HANDLE, h - 3).stroke({ color, width: 2, alpha: 0.7 })
      .rect(w - HANDLE - 4, h - HANDLE - 4, HANDLE + 8, HANDLE + 8).fill({ color: 0xffffff, alpha: 0.001 })
    fitTitle(c.text, w)
    drawBorder()
  }
  draw(comment)

  return {
    container, headerLayer, header, resizeHandle, headerHeight,
    update: draw,
    setVisualState: (s) => { if (s !== state) { state = s; drawBorder() } },
    // While editing show the full (un-truncated) title; redraw to apply.
    setEditing: (e) => { if (e !== editing) { editing = e; draw(current) } },
    setSimplified: (s) => { if (s !== simplified) { simplified = s; draw(current) } },
    destroy: () => {
      highlightGrad.destroy()
      rimGrad.destroy()
      headerFill.destroy()
      container.destroy({ children: true })
      headerLayer.destroy({ children: true })
    },
  }
}
