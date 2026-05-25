import { Container, Graphics, Rectangle, type FederatedPointerEvent } from 'pixi.js'
import type { XenTokens } from '@xenolith/theme-xen'
import type { ViewportState } from '@xenolith/render-pixi'

/** Where the minimap sits. Eight standard anchors (corners + edge centres), or exact screen-space
 *  pixel coordinates of its top-left. */
export type MinimapPosition =
  | 'top-left' | 'top' | 'top-right' | 'right'
  | 'bottom-right' | 'bottom' | 'bottom-left' | 'left'
  | { x: number; y: number }

interface MiniNode { x: number; y: number; width: number; height: number }

/** A screen-space overview map. Draws every node as a dot and the current viewport as a draggable
 *  frame; click/drag recentres the view. Fully themed via `color.minimap` + `geometry.minimap`.
 *  Node layer is redrawn only on graph change; the frame redraws on viewport change (cheap). */
export class Minimap {
  readonly container = new Container({ label: 'minimap' })
  readonly #panel = new Graphics()
  readonly #nodes = new Graphics()
  readonly #frame = new Graphics()
  #tokens: XenTokens
  #position: MinimapPosition = 'bottom-right'

  // World→minimap mapping captured at the last setData().
  #bounds = { minX: 0, minY: 0, width: 1, height: 1 }
  #scale = 1
  #offX = 0
  #offY = 0
  #data: MiniNode[] = []
  #screen = { w: 1, h: 1 }
  #lastViewport: ViewportState = { x: 0, y: 0, zoom: 1 }

  /** Called when the user clicks/drags the minimap — gives the world point to centre on screen. */
  onRecenter: ((worldX: number, worldY: number) => void) | null = null

  constructor(tokens: XenTokens) {
    this.#tokens = tokens
    this.container.eventMode = 'static'
    this.container.cursor = 'pointer'
    this.container.addChild(this.#panel, this.#nodes, this.#frame)
    this.#wirePointer()
    this.#drawPanel()
  }

  get #geo(): XenTokens['geometry']['minimap'] { return this.#tokens.geometry.minimap }

  setStyle(tokens: XenTokens): void {
    this.#tokens = tokens
    this.#drawPanel()
    this.#redrawNodes()
    this.#redrawFrame()
    this.place(this.#screen.w, this.#screen.h)
  }

  setVisible(v: boolean): void { this.container.visible = v }
  get visible(): boolean { return this.container.visible }

  setPosition(pos: MinimapPosition): void {
    this.#position = pos
    this.place(this.#screen.w, this.#screen.h)
  }

  /** Position the panel in screen space per the anchor (with edge padding) or exact coordinates. */
  place(screenW: number, screenH: number): void {
    this.#screen = { w: screenW, h: screenH }
    const g = this.#geo
    const w = g.width, h = g.height, m = g.margin
    let x: number, y: number
    if (typeof this.#position === 'object') {
      x = this.#position.x; y = this.#position.y
    } else {
      const left = m, right = screenW - w - m, hcenter = (screenW - w) / 2
      const top = m, bottom = screenH - h - m, vcenter = (screenH - h) / 2
      switch (this.#position) {
        case 'top-left':     x = left;    y = top;     break
        case 'top':          x = hcenter; y = top;     break
        case 'top-right':    x = right;   y = top;     break
        case 'right':        x = right;   y = vcenter; break
        case 'bottom-right': x = right;   y = bottom;  break
        case 'bottom':       x = hcenter; y = bottom;  break
        case 'bottom-left':  x = left;    y = bottom;  break
        case 'left':         x = left;    y = vcenter; break
      }
    }
    this.container.position.set(Math.round(x), Math.round(y))
  }

  /** Supply the node rects (world space). Recomputes the fit and redraws the static node layer. */
  setData(nodes: MiniNode[]): void {
    this.#data = nodes
    if (nodes.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const n of nodes) {
        minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
        maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height)
      }
      this.#bounds = { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
    } else {
      this.#bounds = { minX: 0, minY: 0, width: 1, height: 1 }
    }
    const g = this.#geo
    const innerW = g.width - g.padding * 2
    const innerH = g.height - g.padding * 2
    this.#scale = Math.min(innerW / this.#bounds.width, innerH / this.#bounds.height)
    this.#offX = (innerW - this.#bounds.width * this.#scale) / 2
    this.#offY = (innerH - this.#bounds.height * this.#scale) / 2
    this.#redrawNodes()
    this.#redrawFrame()
  }

  setViewport(vp: ViewportState, screenW: number, screenH: number): void {
    this.#lastViewport = vp
    this.#screen = { w: screenW, h: screenH }
    this.#redrawFrame()
  }

  #worldToMini(wx: number, wy: number): { x: number; y: number } {
    const g = this.#geo
    return {
      x: g.padding + this.#offX + (wx - this.#bounds.minX) * this.#scale,
      y: g.padding + this.#offY + (wy - this.#bounds.minY) * this.#scale,
    }
  }

  #miniToWorld(mx: number, my: number): { x: number; y: number } {
    const g = this.#geo
    return {
      x: this.#bounds.minX + (mx - g.padding - this.#offX) / this.#scale,
      y: this.#bounds.minY + (my - g.padding - this.#offY) / this.#scale,
    }
  }

  #drawPanel(): void {
    const c = this.#tokens.color.minimap
    const g = this.#geo
    this.#panel.clear()
      .roundRect(0, 0, g.width, g.height, g.radius)
      .fill({ color: c.background })
      .stroke({ color: c.border, width: g.borderWidth, alignment: 1 })
    // Clip node/frame layers to the rounded panel.
    this.container.hitArea = new Rectangle(0, 0, g.width, g.height)
  }

  #redrawNodes(): void {
    const c = this.#tokens.color.minimap
    const g = this.#geo
    this.#nodes.clear()
    for (const n of this.#data) {
      const p = this.#worldToMini(n.x, n.y)
      this.#nodes.roundRect(p.x, p.y, Math.max(1.5, n.width * this.#scale), Math.max(1.5, n.height * this.#scale), g.nodeRadius)
    }
    this.#nodes.fill({ color: c.node })
  }

  #redrawFrame(): void {
    const c = this.#tokens.color.minimap
    const g = this.#geo
    const vp = this.#lastViewport
    const wl = (0 - vp.x) / vp.zoom, wt = (0 - vp.y) / vp.zoom
    const wr = (this.#screen.w - vp.x) / vp.zoom, wb = (this.#screen.h - vp.y) / vp.zoom
    const tl = this.#worldToMini(wl, wt)
    const br = this.#worldToMini(wr, wb)
    // Clamp to the panel interior so the frame never spills past the border.
    const x0 = Math.max(g.padding * 0.5, Math.min(tl.x, br.x))
    const y0 = Math.max(g.padding * 0.5, Math.min(tl.y, br.y))
    const x1 = Math.min(g.width - g.padding * 0.5, Math.max(tl.x, br.x))
    const y1 = Math.min(g.height - g.padding * 0.5, Math.max(tl.y, br.y))
    this.#frame.clear()
      .rect(x0, y0, Math.max(2, x1 - x0), Math.max(2, y1 - y0))
      .fill({ color: c.frame })
      .stroke({ color: c.frameBorder, width: 1.5, alignment: 1 })
  }

  #wirePointer(): void {
    const recenter = (e: FederatedPointerEvent): void => {
      const local = this.container.toLocal({ x: e.global.x, y: e.global.y })
      const world = this.#miniToWorld(local.x, local.y)
      this.onRecenter?.(world.x, world.y)
    }
    let dragging = false
    this.container.on('pointerdown', (e: FederatedPointerEvent) => { dragging = true; recenter(e); e.stopPropagation() })
    this.container.on('globalpointermove', (e: FederatedPointerEvent) => { if (dragging) recenter(e) })
    const stop = (): void => { dragging = false }
    this.container.on('pointerup', stop)
    this.container.on('pointerupoutside', stop)
  }

  destroy(): void { this.container.destroy({ children: true }) }
}
