import { BitmapText, Color, Container, Graphics, FillGradient } from 'pixi.js'
import type { XenTokens } from '@xenolith/theme-xen'

export type MacroFrameState = 'default' | 'hover' | 'selected'
export interface FrameRect { x: number; y: number; width: number; height: number }

export interface MacroFrameView {
  readonly container: Container
  /** Header strip — interactive (editor wires double-click to collapse). */
  readonly header: Container
  readonly headerHeight: number
  update(rect: FrameRect, title: string): void
  setState(state: MacroFrameState): void
  destroy(): void
}

const rgba = (color: string, a: number): string => {
  const c = new Color(color)
  return `rgba(${Math.round(c.red * 255)}, ${Math.round(c.green * 255)}, ${Math.round(c.blue * 255)}, ${a})`
}
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
 * Expanded-macro frame — a themed group rectangle drawn behind the member nodes. The accent is the
 * theme's `category.macro` colour and the header follows the theme's frame style (`gradient` = Xen
 * node-header recipe; `tint` = Liquid Glass flat accent inset), so a macro reads natively in each
 * theme. Body is non-interactive (clicks reach members); only the header captures pointer events.
 */
export function renderMacroFrame(tokens: XenTokens, headerStyle: 'gradient' | 'tint' = 'gradient'): MacroFrameView {
  const geo = tokens.geometry.comment
  const typo = tokens.typography.comment
  const headerHeight = geo.headerHeight
  const radius = geo.radius ?? tokens.geometry.node.radius
  const accent = tokens.category.macro.accent

  const container = new Container({ label: 'macro-frame' })
  // Body is interactive so a click on empty space INSIDE the expanded frame is captured here (not
  // treated as a click-outside that would collapse the macro). Members sit above and take their own clicks.
  const body = new Graphics(); body.eventMode = 'static'
  body.on('pointerdown', (e) => e.stopPropagation())
  const headerBase = new Graphics(); headerBase.eventMode = 'none'
  const headerFillG = new Graphics(); headerFillG.eventMode = 'none'
  const headerHighlight = new Graphics(); headerHighlight.eventMode = 'none'
  const headerRim = new Graphics(); headerRim.eventMode = 'none'
  const border = new Graphics(); border.eventMode = 'none'

  const header = new Container({ label: 'macro-frame-header' })
  header.eventMode = 'static'
  header.cursor = 'pointer'
  const headerHit = new Graphics(); headerHit.eventMode = 'static'
  header.addChild(headerHit)

  const title = new BitmapText({
    text: 'Macro',
    style: { fontFamily: tokens.typography.fontFamily, fontSize: typo.size, fontWeight: '700' as never, fill: typo.color },
  })
  title.eventMode = 'none'
  title.anchor.set(0, 0.5)
  title.x = 10
  title.y = headerHeight / 2

  container.addChild(body, headerBase, headerFillG, headerHighlight, border, headerRim, header, title)

  const highlightGrad = new FillGradient({
    type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
    colorStops: [{ offset: 0, color: 'rgba(255,255,255,0.25)' }, { offset: 0.6, color: 'rgba(255,255,255,0)' }], textureSpace: 'local',
  })
  const rimGrad = new FillGradient({
    type: 'linear', start: { x: 0, y: 0 }, end: { x: 0, y: 1 },
    colorStops: [{ offset: 0, color: 'rgba(255,255,255,0.8)' }, { offset: 1, color: 'rgba(255,255,255,0)' }], textureSpace: 'local',
  })
  const headerFill = new FillGradient({
    type: 'linear', start: { x: 0, y: 0 }, end: { x: 1, y: 0 },
    colorStops: [{ offset: 0, color: rgba(accent, 0.6) }, { offset: 1, color: rgba(accent, 0) }], textureSpace: 'local',
  })

  let cur: FrameRect = { x: 0, y: 0, width: 0, height: 0 }
  let state: MacroFrameState = 'default'

  const drawBorder = (): void => {
    const w = cur.width, h = cur.height
    border.clear()
    if (state === 'selected') border.roundRect(0, 0, w, h, radius).stroke({ color: 0xffffff, width: 2, alpha: 0.95 })
    else border.roundRect(0, 0, w, h, radius).stroke({ color: accent, width: state === 'hover' ? 2 : 1.5, alpha: state === 'hover' ? 0.9 : 0.6 })
  }

  const update = (rect: FrameRect, label: string): void => {
    cur = rect
    const w = rect.width, h = rect.height
    container.position.set(rect.x, rect.y)
    // Expanded macro reads as a focused panel — a fairly opaque body so members inside stand out and
    // the rest of the graph (behind it) is visually pushed back.
    body.clear().roundRect(0, 0, w, h, radius).fill({ color: tokens.color.surface.canvas, alpha: 0.86 })
      .roundRect(0, 0, w, h, radius).fill({ color: tokens.color.surface.node, alpha: 0.55 })
      .roundRect(0, 0, w, h, radius).fill({ color: accent, alpha: 0.12 })
    headerBase.clear(); headerFillG.clear(); headerHighlight.clear(); headerRim.clear()
    if (headerStyle === 'tint') {
      headerFillG.roundRect(2, 2, w - 4, headerHeight - 1, Math.max(0, radius - 1)).fill({ color: accent, alpha: 0.45 })
    } else {
      topRoundedRect(headerBase, w, headerHeight, radius).fill({ color: tokens.color.surface.node })
      topRoundedRect(headerFillG, w, headerHeight, radius).fill(headerFill)
      topRoundedRect(headerHighlight, w, headerHeight, radius).fill(highlightGrad)
      topRimPath(headerRim, w, radius).stroke({ width: 0.75, fill: rimGrad, alignment: 0 })
    }
    headerHit.clear().rect(0, 0, w, headerHeight).fill({ color: 0xffffff, alpha: 0.001 })
    title.text = label
    drawBorder()
  }

  return {
    container, header, headerHeight,
    update,
    setState: (s) => { if (s !== state) { state = s; drawBorder() } },
    destroy: () => { highlightGrad.destroy(); rimGrad.destroy(); headerFill.destroy(); container.destroy({ children: true }) },
  }
}
