import { Application, Container, EventEmitter as PixiEventEmitter, FederatedPointerEvent, Graphics, RenderTexture, type ContainerChild, type TextureSource } from 'pixi.js'
import {
  CommandBus,
  ConnectPins,
  DisconnectEdge,
  EventEmitter,
  Graph,
  MoveNode,
  Selection,
  createEdgeId,
  type CoreEvents,
  type Edge,
  type EdgeId,
  type Node,
  type NodeId,
  type Pin,
  type PinId,
} from '@xenolith/core'
import {
  computeNodeLayout,
  createGridSprite,
  drawEdge,
  InteractionManager,
  nodeBounds,
  rectFromPoints,
  rectIntersects,
  renderNode,
  computeGroupSnappedDelta,
  readPinHandle,
  screenToWorld,
  Viewport,
  xenTheme,
  type NodeView,
  type PinHandle,
  type PinLayout,
  type RenderEdgeOptions,
  type RenderNodeOptions,
  type ThemeRenderContext,
  type ViewportState,
  type XenolithTheme,
  type ZoomBounds,
} from '@xenolith/render-pixi'
import { xenTokens, loadXenFonts, mergeTheme, type DeepPartial, type XenTokens } from '@xenolith/theme-xen'
import { canConnect } from './pin-compat.js'

export const VERSION = '0.0.0'

const MARQUEE_DRAG_THRESHOLD = 4
const NODE_DRAG_THRESHOLD = 4

export interface XenolithEditorOptions {
  /** Either a full XenolithTheme (Xen, Liquid Glass, Pixel Art, …) or a partial token override
   *  that is deep-merged into the default Xen theme. Themes can be swapped at runtime via
   *  `editor.setTheme(...)`. */
  theme?: XenolithTheme | DeepPartial<XenTokens>
  background?: string
  resizeToWindow?: boolean
  renderer?: 'webgl' | 'webgpu'
  viewport?: ViewportState
  zoomBounds?: ZoomBounds
  disableInteraction?: boolean
  disableGrid?: boolean
  /** Snap cell size in world pixels when dragging. Hold Alt during drag to disable. Default: 8. */
  snap?: number
}

function resolveTheme(input: XenolithTheme | DeepPartial<XenTokens> | undefined): XenolithTheme {
  if (!input) return xenTheme
  if (typeof input === 'object' && 'id' in input && 'tokens' in input) return input as XenolithTheme
  return { id: 'xen-custom', tokens: mergeTheme(xenTheme.tokens, input as DeepPartial<XenTokens>) }
}

interface EdgeRecord {
  edge: Edge
  graphics: Graphics
  opts: RenderEdgeOptions
}

type DragState =
  | { kind: 'idle' }
  | { kind: 'pending'; nodeId: NodeId; startScreen: { x: number; y: number }; shift: boolean; alt: boolean }
  | {
      kind: 'active'
      startScreen: { x: number; y: number }
      anchorId: NodeId
      initialPositions: Map<NodeId, { x: number; y: number }>
      affectedEdges: Set<EdgeId>
      alt: boolean
    }
  | {
      kind: 'pin-drag'
      source: PinHandle
      ghost: Graphics
      hoveredTarget: PinHandle | null
      /** When the drag began by tearing an edge off a connected pin, this is the original edge.
       *  Esc restores it; a successful drop on a new target leaves it removed. */
      rewireOriginal: Edge | null
    }

type MarqueeState =
  | { kind: 'idle' }
  | { kind: 'pending'; startScreen: { x: number; y: number }; startWorld: { x: number; y: number }; shift: boolean }
  | {
      kind: 'active'
      startScreen: { x: number; y: number }
      startWorld: { x: number; y: number }
      gfx: Graphics
      shift: boolean
    }

export class XenolithEditor {
  readonly graph: Graph
  readonly selection: Selection
  readonly commandBus: CommandBus
  readonly #app: Application
  #theme: XenolithTheme
  #gridLayer: Container | null = null
  /** Live snapshot of the world MINUS the nodes layer — created lazily the first time the
   *  active theme opts in via `theme.needsBackdrop = true`. Themes that don't sample the
   *  backdrop pay zero extra render cost. */
  #backdropRT: RenderTexture | null = null
  readonly #world: Container<ContainerChild>
  readonly #edgesLayer: Container<ContainerChild>
  readonly #nodesLayer: Container<ContainerChild>
  readonly #viewport: Viewport
  readonly #interaction: InteractionManager | null
  readonly #zoomBounds: ZoomBounds
  readonly #snapSize: number
  readonly #views = new Map<NodeId, NodeView>()
  /** Per-node render options (category, title, collapsed). Captured at addNode so setTheme can
   *  re-issue the render with identical args after swapping the active theme. */
  readonly #renderOpts = new Map<NodeId, RenderNodeOptions>()
  readonly #edgeRecords = new Map<EdgeId, EdgeRecord>()
  readonly #coreEvents = new EventEmitter<CoreEvents>()
  #hoveredId: NodeId | null = null
  readonly #marqueeHovered = new Set<NodeId>()
  #dragState: DragState = { kind: 'idle' }

  private constructor(app: Application, theme: XenolithTheme, opts: XenolithEditorOptions) {
    this.#app = app
    this.#theme = theme
    if (theme.needsBackdrop) {
      this.#backdropRT = this.#createBackdropRT()
    }
    this.graph = new Graph()
    this.selection = new Selection()
    this.commandBus = new CommandBus({ graph: this.graph, events: this.#coreEvents })
    this.#zoomBounds = opts.zoomBounds ?? [0.25, 2]
    this.#snapSize = opts.snap ?? 8

    this.#world = new Container({ label: 'world' })
    this.#edgesLayer = new Container({ label: 'edges' })
    this.#nodesLayer = new Container({ label: 'nodes' })
    if (!opts.disableGrid) {
      this.#gridLayer = this.#createGrid()
      this.#world.addChild(this.#gridLayer)
    }
    this.#world.addChild(this.#edgesLayer, this.#nodesLayer)
    app.stage.addChild(this.#world)

    this.#viewport = new Viewport(this.#world, opts.viewport)

    if (!opts.disableInteraction) {
      this.#interaction = new InteractionManager(app.canvas as HTMLCanvasElement)
      this.#interaction.attach()
      this.#interaction.onZoom(({ focal, factor }) => {
        this.#viewport.zoomAt(focal, factor, this.#zoomBounds)
      })
      this.#interaction.onPan(({ dx, dy }) => {
        this.#viewport.pan(dx, dy)
      })
      app.stage.eventMode = 'static'
      app.stage.hitArea = app.screen
      this.#wireStageInteraction()
      window.addEventListener('keydown', this.#onKeyDown)
    } else {
      this.#interaction = null
    }

    this.selection.on(() => this.#updateVisualStates())

    // Redraw every edge each frame so collapse/expand animations track pin positions live.
    // The cost is one drawEdge per edge per frame — cheap on Graphics in PIXI v8.
    app.ticker.add(() => {
      for (const edgeId of this.#edgeRecords.keys()) this.#redrawEdge(edgeId)
      this.#updateBackdrop()
    })
  }

  static async init(
    target: string | HTMLElement,
    opts: XenolithEditorOptions = {},
  ): Promise<XenolithEditor> {
    const el = typeof target === 'string' ? document.querySelector(target) : target
    if (!(el instanceof HTMLElement)) {
      throw new Error(
        `XenolithEditor.init: target ${JSON.stringify(target)} did not resolve to an HTMLElement`,
      )
    }
    await loadXenFonts()
    const theme = resolveTheme(opts.theme)
    const app = new Application()
    const initOpts: Parameters<Application['init']>[0] = {
      background: opts.background ?? theme.tokens.color.surface.canvas,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      preference: opts.renderer ?? 'webgl',
    }
    if (opts.resizeToWindow !== false) initOpts.resizeTo = window
    await app.init(initOpts)
    el.appendChild(app.canvas)
    return new XenolithEditor(app, theme, opts)
  }

  // ----- theme hook wrappers ---------------------------------------------------------------
  // Every visual element goes through these so that #theme.<hook> wins when present, with the
  // built-in Xen renderer as a fallback. Keeps the rest of the editor agnostic to which theme
  // is currently active.

  #renderNode(node: Node, opts: RenderNodeOptions): NodeView {
    return this.#theme.renderNode?.(node, opts, this.#themeContext()) ?? renderNode(node, this.#theme.tokens, opts)
  }
  #drawEdge(g: Graphics, from: PinLayout, to: PinLayout, opts: RenderEdgeOptions): Graphics {
    return this.#theme.drawEdge?.(g, from, to, opts) ?? drawEdge(g, from, to, this.#theme.tokens, opts)
  }
  #renderEdge(from: PinLayout, to: PinLayout, opts: RenderEdgeOptions): Graphics {
    return this.#drawEdge(new Graphics(), from, to, opts)
  }
  #createGrid(): Container {
    return this.#theme.createGrid?.() ?? createGridSprite(this.#theme.tokens)
  }

  #createBackdropRT(): RenderTexture {
    return RenderTexture.create({
      width:      Math.max(1, this.#app.screen.width),
      height:     Math.max(1, this.#app.screen.height),
      resolution: this.#app.renderer.resolution,
      antialias:  true,
    })
  }

  /** Render the world without the nodes layer into `#backdropRT`. No-op when the active theme
   *  has `needsBackdrop = false` — the RT itself isn't even allocated in that case. One extra
   *  render pass per frame when enabled; acceptable cost for the visual it buys. */
  #updateBackdrop(): void {
    if (!this.#backdropRT) return
    const sw = Math.max(1, this.#app.screen.width)
    const sh = Math.max(1, this.#app.screen.height)
    if (this.#backdropRT.width !== sw || this.#backdropRT.height !== sh) {
      this.#backdropRT.resize(sw, sh)
    }
    const nodesWereVisible = this.#nodesLayer.visible
    this.#nodesLayer.visible = false
    this.#app.renderer.render({ container: this.#app.stage, target: this.#backdropRT })
    this.#nodesLayer.visible = nodesWereVisible
  }

  /** Theme hooks read this to drive backdrop-sampling shaders. */
  #themeContext(): ThemeRenderContext {
    return { backdropTexture: this.#backdropRT?.source ?? null }
  }

  addNode(node: Node, render: RenderNodeOptions = {}): Node {
    this.graph._addNode(node)
    this.#renderOpts.set(node.id, render)
    const view = this.#renderNode(node, render)
    this.#views.set(node.id, view)
    this.#nodesLayer.addChild(view.container)
    this.#wireNodeInteraction(node.id, view)
    return node
  }

  connect(
    fromNode: Node,
    fromPinIndex: number,
    toNode: Node,
    toPinIndex: number,
    opts: RenderEdgeOptions = {},
  ): EdgeId {
    const fromPin = this.#pinLayoutFor(fromNode, fromPinIndex)
    const toPin = this.#pinLayoutFor(toNode, toPinIndex)
    const fromPinModel = fromNode.pins[fromPinIndex]!
    const toPinModel = toNode.pins[toPinIndex]!
    const edge: Edge = {
      id: createEdgeId(),
      from: { node: fromNode.id, pin: fromPinModel.id },
      to:   { node: toNode.id,   pin: toPinModel.id   },
    }
    this.graph._addEdge(edge)
    const gfx = this.#renderEdge(fromPin, toPin, opts)
    this.#edgesLayer.addChild(gfx)
    this.#edgeRecords.set(edge.id, { edge, graphics: gfx, opts })
    return edge.id
  }

  pan(dx: number, dy: number): void { this.#viewport.pan(dx, dy) }
  zoomAt(focal: { x: number; y: number }, factor: number): void {
    this.#viewport.zoomAt(focal, factor, this.#zoomBounds)
  }
  resetView(): void { this.#viewport.reset() }
  get viewport(): ViewportState { return this.#viewport.state }
  get app(): Application { return this.#app }
  get theme(): XenolithTheme { return this.#theme }
  get tokens(): XenTokens { return this.#theme.tokens }

  /**
   * Swap the active theme at runtime. Re-renders every node and recreates the grid; edges and
   * the ghost-edge (if any) pick up the new style on the next ticker frame. Selection, hover,
   * collapsed state, and node positions are preserved.
   *
   * Accepts either a full `XenolithTheme` or a `DeepPartial<XenTokens>` to tweak the active
   * theme's tokens while keeping its render hooks.
   */
  setTheme(input: XenolithTheme | DeepPartial<XenTokens>): void {
    const next: XenolithTheme = (typeof input === 'object' && 'id' in input && 'tokens' in input)
      ? input as XenolithTheme
      : { ...this.#theme, tokens: mergeTheme(this.#theme.tokens, input as DeepPartial<XenTokens>) }
    if (next === this.#theme) return
    this.#theme = next

    // Allocate/free backdrop RT to match the new theme's needs — Xen-style flat themes get the
    // extra render pass turned off entirely.
    if (next.needsBackdrop && !this.#backdropRT) {
      this.#backdropRT = this.#createBackdropRT()
    } else if (!next.needsBackdrop && this.#backdropRT) {
      this.#backdropRT.destroy(true)
      this.#backdropRT = null
    }

    // Canvas background follows the new theme.
    this.#app.renderer.background.color = next.tokens.color.surface.canvas

    // Re-create grid (themes may swap it for an entirely different visual).
    if (this.#gridLayer) {
      this.#gridLayer.parent?.removeChild(this.#gridLayer)
      this.#gridLayer.destroy({ children: true })
      this.#gridLayer = this.#createGrid()
      this.#world.addChildAt(this.#gridLayer, 0)
    }

    // Re-render every node through the new theme. We rebuild each NodeView from the source-of-
    // truth Node and discard the old container; collapsed state, position, and selection are
    // restored from the Graph + Selection (which are theme-agnostic).
    for (const [id, oldView] of [...this.#views]) {
      const node = this.graph.getNode(id)
      if (!node) continue
      const wasCollapsed = oldView.isCollapsed()
      const baseOpts = this.#renderOpts.get(id) ?? {}
      const newView = this.#renderNode(node, { ...baseOpts, collapsed: wasCollapsed })
      this.#nodesLayer.removeChild(oldView.container)
      oldView.container.destroy({ children: true })
      this.#views.set(id, newView)
      this.#nodesLayer.addChild(newView.container)
      this.#wireNodeInteraction(id, newView)
    }
    this.#updateVisualStates()
    // Edges re-paint themselves through the ticker via #drawEdge — no explicit pass needed.
  }

  destroy(): void {
    window.removeEventListener('keydown', this.#onKeyDown)
    this.#interaction?.detach()
    this.#backdropRT?.destroy(true)
    this.#app.destroy(true, { children: true })
  }

  readonly #onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.#dragState.kind === 'pin-drag') {
      this.#cancelPinDrag()
    }
  }

  #updateVisualStates(): void {
    for (const [id, view] of this.#views) {
      let next: 'default' | 'hover' | 'selected'
      if (this.selection.contains(id)) next = 'selected'
      else if (this.#marqueeHovered.has(id) || id === this.#hoveredId) next = 'hover'
      else next = 'default'
      view.setVisualState(next)
    }
  }

  /** World-space position for a node, using its Container's current Container.position during a
   *  drag (the graph itself hasn't been mutated until pointerup), or its graph position otherwise. */
  #livePosition(nodeId: NodeId): { x: number; y: number } | null {
    const view = this.#views.get(nodeId)
    if (view) return { x: view.container.position.x, y: view.container.position.y }
    const node = this.graph.getNode(nodeId)
    return node ? { ...node.position } : null
  }

  #pinLayoutFor(node: Node, pinIndex: number): PinLayout {
    const layout = computeNodeLayout(node, {
      node:   this.#theme.tokens.geometry.node,
      pin:    {
        diameter:   this.#theme.tokens.geometry.pin.diameter,
        rowSpacing: this.#theme.tokens.geometry.pin.rowSpacing,
        rowHeight:  this.#theme.tokens.geometry.pin.rowHeight,
      },
      header: { toPinsGap: this.#theme.tokens.geometry.header.toPinsGap },
    })
    const pin = node.pins[pinIndex]
    if (!pin) throw new Error(`pinLayoutFor: no pin at index ${pinIndex}`)
    const layoutPin = layout.pins.find((p) => p.id === pin.id)
    if (!layoutPin) throw new Error(`pinLayoutFor: pin not in layout`)
    return layoutPin
  }

  /** Recompute and paint a single edge using each endpoint's live (drag/collapse-aware) position.
   *  When a node is collapsed (or animating), the pin is at a different local position — we ask
   *  the NodeView directly. Otherwise we fall back to computeNodeLayout. */
  #redrawEdge(edgeId: EdgeId): void {
    const rec = this.#edgeRecords.get(edgeId)
    if (!rec) return
    const fromNode = this.graph.getNode(rec.edge.from.node)
    const toNode = this.graph.getNode(rec.edge.to.node)
    if (!fromNode || !toNode) return
    const fromPos = this.#pinWorldPosition(fromNode, rec.edge.from.pin)
    const toPos = this.#pinWorldPosition(toNode, rec.edge.to.pin)
    if (!fromPos || !toPos) return
    this.#drawEdge(rec.graphics, fromPos, toPos, rec.opts)
  }

  #pinWorldPosition(node: Node, pinId: string): PinLayout | null {
    const view = this.#views.get(node.id)
    const livePos = this.#livePosition(node.id) ?? node.position
    if (view) {
      const local = view.pinLocalPosition(pinId)
      if (local) {
        const pin = node.pins.find((p) => p.id === pinId)
        if (!pin) return null
        return {
          id: pin.id as PinLayout['id'],
          x: livePos.x + local.x,
          y: livePos.y + local.y,
          side: pin.direction === 'in' ? 'left' : 'right',
        }
      }
    }
    const idx = node.pins.findIndex((p) => p.id === pinId)
    if (idx < 0) return null
    return this.#pinLayoutFor({ ...node, position: livePos }, idx)
  }

  /** Return the EdgeId of the most-recently-added edge incident to this pin, or null. The Map's
   *  insertion order gives us "newest first" by iterating in reverse. */
  #findIncidentEdgeId(nodeId: NodeId, pinId: string): EdgeId | null {
    const records = [...this.#edgeRecords.values()].reverse()
    for (const rec of records) {
      if ((rec.edge.from.node === nodeId && String(rec.edge.from.pin) === pinId) ||
          (rec.edge.to.node   === nodeId && String(rec.edge.to.pin)   === pinId)) {
        return rec.edge.id
      }
    }
    return null
  }

  /** Remove an edge's Graphics from the scene and drop its bookkeeping. The command-bus
   *  invocation (DisconnectEdge) is the caller's job. */
  #disposeEdgeGraphics(edgeId: EdgeId): void {
    const rec = this.#edgeRecords.get(edgeId)
    if (!rec) return
    rec.graphics.parent?.removeChild(rec.graphics)
    rec.graphics.destroy()
    this.#edgeRecords.delete(edgeId)
  }

  #countEdgesAtPin(nodeId: NodeId, pinId: string): number {
    let n = 0
    for (const edge of this.graph.edges()) {
      if ((edge.from.node === nodeId && String(edge.from.pin) === pinId) ||
          (edge.to.node   === nodeId && String(edge.to.pin)   === pinId)) {
        n++
      }
    }
    return n
  }

  /** Find every edge that touches any node in `nodeIds`. */
  #edgesAttachedTo(nodeIds: ReadonlySet<NodeId>): Set<EdgeId> {
    const out = new Set<EdgeId>()
    for (const [edgeId, rec] of this.#edgeRecords) {
      if (nodeIds.has(rec.edge.from.node) || nodeIds.has(rec.edge.to.node)) out.add(edgeId)
    }
    return out
  }

  #wireStageInteraction(): void {
    let marquee: MarqueeState = { kind: 'idle' }
    const stage = this.#app.stage

    stage.on('pointerdown', (e: FederatedPointerEvent) => {
      if (e.button !== 0) return
      const pin = readPinHandle(e.target)
      if (pin) {
        // Alt+pin on a connected pin = "tear off" the edge and continue dragging the loose
        // end. UE Blueprint convention. If the pin has no incident edges, fall through to a
        // fresh pin-drag from this pin.
        if (e.altKey) {
          const detached = this.#detachEdgeFromPin(pin)
          if (detached) {
            this.#beginPinDrag(detached.other, e, detached.original)
            e.stopPropagation()
            return
          }
        }
        this.#beginPinDrag(pin, e, null)
        e.stopPropagation()
        return
      }
      if (e.target !== stage) return
      const startScreen = { x: e.global.x, y: e.global.y }
      marquee = {
        kind: 'pending',
        startScreen,
        startWorld: screenToWorld(startScreen, this.#viewport.state),
        shift: e.shiftKey,
      }
    })

    stage.on('pointermove', (e: FederatedPointerEvent) => {
      const current = { x: e.global.x, y: e.global.y }

      if (this.#dragState.kind === 'pin-drag') {
        const target = readPinHandle(e.target)
        this.#updatePinDrag(current, target)
        return
      }

      if (this.#dragState.kind === 'pending') {
        const dx = current.x - this.#dragState.startScreen.x
        const dy = current.y - this.#dragState.startScreen.y
        if (Math.hypot(dx, dy) >= NODE_DRAG_THRESHOLD) {
          this.#beginNodeDrag(this.#dragState.alt)
        }
      }
      if (this.#dragState.kind === 'active') {
        const zoom = this.#viewport.state.zoom
        const worldDelta = {
          x: (current.x - this.#dragState.startScreen.x) / zoom,
          y: (current.y - this.#dragState.startScreen.y) / zoom,
        }
        // Snap during drag, not only at commit — gives the UE / Figma "node clicks into cells"
        // feel. Hold Alt at any point during the drag to disable. The snap is anchored to the
        // node under the cursor and the resulting delta applied uniformly, so the group's
        // internal layout is preserved (per-node snapping caused off-grid nodes to drift apart).
        const snap = e.altKey || this.#dragState.alt ? null : this.#snapSize
        const anchorInitial = this.#dragState.initialPositions.get(this.#dragState.anchorId)
        const snappedDelta = anchorInitial
          ? computeGroupSnappedDelta(anchorInitial, worldDelta, snap)
          : worldDelta
        for (const [id, initial] of this.#dragState.initialPositions) {
          const view = this.#views.get(id)
          if (!view) continue
          view.container.position.set(initial.x + snappedDelta.x, initial.y + snappedDelta.y)
        }
        for (const edgeId of this.#dragState.affectedEdges) this.#redrawEdge(edgeId)
        return
      }

      if (marquee.kind === 'idle') return
      if (marquee.kind === 'pending') {
        const dx = current.x - marquee.startScreen.x
        const dy = current.y - marquee.startScreen.y
        if (Math.hypot(dx, dy) < MARQUEE_DRAG_THRESHOLD) return
        const gfx = new Graphics()
        this.#world.addChild(gfx)
        marquee = { ...marquee, kind: 'active', gfx }
      }
      if (marquee.kind === 'active') {
        const currentWorld = screenToWorld(current, this.#viewport.state)
        const rect = rectFromPoints(marquee.startWorld, currentWorld)
        marquee.gfx.clear()
          .rect(rect.x, rect.y, rect.width, rect.height)
          .fill({ color: 'rgba(252, 180, 0, 0.08)' })
          .stroke({ color: '#FCB400', width: 1 / this.#viewport.state.zoom, alpha: 0.8 })
        this.#marqueeHovered.clear()
        for (const node of this.graph.nodes()) {
          if (rectIntersects(rect, nodeBounds(node, this.#theme.tokens))) {
            this.#marqueeHovered.add(node.id)
          }
        }
        this.#updateVisualStates()
      }
    })

    const endStage = (e: FederatedPointerEvent): void => {
      if (this.#dragState.kind === 'pin-drag') {
        this.#endPinDrag(readPinHandle(e.target))
        return
      }
      if (this.#dragState.kind !== 'idle') {
        this.#endNodeDrag(e.altKey)
        return
      }
      if (marquee.kind === 'idle') return
      if (marquee.kind === 'pending') {
        if (!marquee.shift) this.selection.clear()
        marquee = { kind: 'idle' }
        return
      }
      const currentWorld = screenToWorld({ x: e.global.x, y: e.global.y }, this.#viewport.state)
      const rect = rectFromPoints(marquee.startWorld, currentWorld)
      const ids: NodeId[] = []
      for (const node of this.graph.nodes()) {
        if (rectIntersects(rect, nodeBounds(node, this.#theme.tokens))) ids.push(node.id)
      }
      this.#marqueeHovered.clear()
      if (marquee.shift) {
        const merged = new Set([...this.selection.ids(), ...ids])
        this.selection.replaceWith([...merged])
      } else {
        this.selection.replaceWith(ids)
      }
      marquee.gfx.parent?.removeChild(marquee.gfx)
      marquee.gfx.destroy()
      marquee = { kind: 'idle' }
    }
    stage.on('pointerup', endStage)
    stage.on('pointerupoutside', endStage)
  }

  #wireNodeInteraction(id: NodeId, view: NodeView): void {
    view.container.eventMode = 'static'
    view.container.cursor = 'pointer'

    view.container.on('pointerover', () => {
      this.#hoveredId = id
      this.#updateVisualStates()
    })
    view.container.on('pointerout', () => {
      if (this.#hoveredId === id) this.#hoveredId = null
      this.#updateVisualStates()
    })
    view.container.on('pointerdown', (e: FederatedPointerEvent) => {
      if (e.button !== 0) return
      if (readPinHandle(e.target)) return
      if (!this.selection.contains(id)) {
        this.selection.select(id, e.shiftKey ? 'toggle' : 'replace')
      }
      this.#dragState = {
        kind: 'pending',
        nodeId: id,
        startScreen: { x: e.global.x, y: e.global.y },
        shift: e.shiftKey,
        alt: e.altKey,
      }
      e.stopPropagation()
    })
  }

  #beginNodeDrag(alt: boolean): void {
    if (this.#dragState.kind !== 'pending') return
    const initialPositions = new Map<NodeId, { x: number; y: number }>()
    // Drag the entire selection if any; otherwise just the node that was pressed.
    const anchorId = this.#dragState.nodeId
    const ids = this.selection.size > 0 ? this.selection.ids() : [anchorId]
    for (const id of ids) {
      const node = this.graph.getNode(id)
      if (node) initialPositions.set(id, { ...node.position })
    }
    const affectedEdges = this.#edgesAttachedTo(new Set(initialPositions.keys()))
    this.#dragState = {
      kind: 'active',
      startScreen: this.#dragState.startScreen,
      anchorId,
      initialPositions,
      affectedEdges,
      alt,
    }
  }

  /** Drop the (most recent) edge incident to `pin` and return a handle to the *other* endpoint
   *  along with the original edge so the caller can restore it on cancel. */
  #detachEdgeFromPin(pin: PinHandle): { other: PinHandle; original: Edge } | null {
    const edgeId = this.#findIncidentEdgeId(pin.nodeId as NodeId, pin.pinId)
    if (!edgeId) return null
    const rec = this.#edgeRecords.get(edgeId)
    if (!rec) return null
    const original: Edge = { ...rec.edge, from: { ...rec.edge.from }, to: { ...rec.edge.to } }
    const fromIsTorn = rec.edge.from.node === (pin.nodeId as NodeId) && String(rec.edge.from.pin) === pin.pinId
    const otherEndRef = fromIsTorn ? rec.edge.to : rec.edge.from
    const otherNode = this.graph.getNode(otherEndRef.node)
    const otherPin: Pin | undefined = otherNode?.pins.find((p) => p.id === otherEndRef.pin)
    if (!otherNode || !otherPin) return null
    this.commandBus.apply(new DisconnectEdge(edgeId))
    this.#disposeEdgeGraphics(edgeId)
    return {
      other: {
        nodeId: String(otherNode.id),
        pinId: String(otherPin.id),
        direction: otherPin.direction,
        kind: otherPin.kind,
        type: String(otherPin.type),
      },
      original,
    }
  }

  #beginPinDrag(source: PinHandle, e: FederatedPointerEvent, rewireOriginal: Edge | null): void {
    if (this.#dragState.kind !== 'idle') return
    const ghost = new Graphics()
    ghost.eventMode = 'none'
    this.#edgesLayer.addChild(ghost)
    this.#dragState = { kind: 'pin-drag', source, ghost, hoveredTarget: null, rewireOriginal }
    this.#updatePinDrag({ x: e.global.x, y: e.global.y }, null)
  }

  #updatePinDrag(screen: { x: number; y: number }, hoveredTarget: PinHandle | null): void {
    if (this.#dragState.kind !== 'pin-drag') return
    const { source, ghost } = this.#dragState
    const sourceNode = this.graph.getNode(source.nodeId as NodeId)
    if (!sourceNode) return
    const sourcePos = this.#pinWorldPosition(sourceNode, source.pinId)
    if (!sourcePos) return
    const cursorWorld = screenToWorld(screen, this.#viewport.state)
    const cursorEndpoint: PinLayout = {
      id: 'ghost' as PinLayout['id'],
      x: cursorWorld.x,
      y: cursorWorld.y,
      side: source.direction === 'out' ? 'left' : 'right',
    }
    const from = source.direction === 'out' ? sourcePos : cursorEndpoint
    const to = source.direction === 'out' ? cursorEndpoint : sourcePos
    this.#drawEdge(ghost, from, to, { sourceType: source.type })

    let validity: 'none' | 'valid' | 'invalid' = 'none'
    if (hoveredTarget) {
      const targetNode = this.graph.getNode(hoveredTarget.nodeId as NodeId)
      const sourcePin = sourceNode.pins.find((p) => String(p.id) === source.pinId)
      const targetPin = targetNode?.pins.find((p) => String(p.id) === hoveredTarget.pinId)
      if (sourcePin && targetPin && targetNode) {
        const ok = canConnect(sourcePin, targetPin, sourceNode.id === targetNode.id, {
          sourceEdges: this.#countEdgesAtPin(sourceNode.id, source.pinId),
          targetEdges: this.#countEdgesAtPin(targetNode.id, hoveredTarget.pinId),
        })
        validity = ok ? 'valid' : 'invalid'
      } else {
        validity = 'invalid'
      }
    }
    ghost.alpha = validity === 'none' ? 0.55 : 1
    ghost.tint = validity === 'invalid' ? 0xff5577 : 0xffffff

    this.#dragState = { ...this.#dragState, hoveredTarget }
  }

  #endPinDrag(target: PinHandle | null): void {
    if (this.#dragState.kind !== 'pin-drag') return
    const { source, ghost, rewireOriginal } = this.#dragState
    const sourceNode = this.graph.getNode(source.nodeId as NodeId)
    const sourcePin = sourceNode?.pins.find((p) => String(p.id) === source.pinId)
    let committed = false
    if (target && sourceNode && sourcePin) {
      const targetNode = this.graph.getNode(target.nodeId as NodeId)
      const targetPin = targetNode?.pins.find((p) => String(p.id) === target.pinId)
      if (
        targetNode &&
        targetPin &&
        canConnect(sourcePin, targetPin, sourceNode.id === targetNode.id, {
          sourceEdges: this.#countEdgesAtPin(sourceNode.id, source.pinId),
          targetEdges: this.#countEdgesAtPin(targetNode.id, target.pinId),
        })
      ) {
        // Normalise edge orientation to (out → in) so the data model stays consistent regardless
        // of which end the user dragged from.
        const fromIsSource = sourcePin.direction === 'out'
        const outNode = fromIsSource ? sourceNode : targetNode
        const outPin: Pin = fromIsSource ? sourcePin : targetPin
        const inNode = fromIsSource ? targetNode : sourceNode
        const inPin: Pin = fromIsSource ? targetPin : sourcePin
        const edge: Edge = {
          id: createEdgeId(),
          from: { node: outNode.id, pin: outPin.id as PinId },
          to: { node: inNode.id, pin: inPin.id as PinId },
        }
        this.commandBus.apply(new ConnectPins(edge))
        const fromPos = this.#pinWorldPosition(outNode, String(outPin.id))
        const toPos = this.#pinWorldPosition(inNode, String(inPin.id))
        if (fromPos && toPos) {
          const opts: RenderEdgeOptions = { sourceType: String(outPin.type) }
          const gfx = this.#renderEdge(fromPos, toPos, opts)
          this.#edgesLayer.addChild(gfx)
          this.#edgeRecords.set(edge.id, { edge, graphics: gfx, opts })
          committed = true
        }
      }
    }
    ghost.parent?.removeChild(ghost)
    ghost.destroy()
    this.#dragState = { kind: 'idle' }
    // Rewire dropped in empty space (or on incompatible) → snap the original edge back. Same
    // behaviour as Esc; matches UE Blueprint where releasing into the void cancels the reroute.
    if (!committed && rewireOriginal) this.#restoreEdge(rewireOriginal)
  }

  #cancelPinDrag(): void {
    if (this.#dragState.kind !== 'pin-drag') return
    const { rewireOriginal } = this.#dragState
    this.#dragState.ghost.parent?.removeChild(this.#dragState.ghost)
    this.#dragState.ghost.destroy()
    this.#dragState = { kind: 'idle' }
    if (rewireOriginal) this.#restoreEdge(rewireOriginal)
  }

  /** Re-create an edge that was removed at the start of a rewire when the drag is cancelled or
   *  dropped in empty space. Pushes a ConnectPins command so it lands in undo history. */
  #restoreEdge(edge: Edge): void {
    const fromNode = this.graph.getNode(edge.from.node)
    const toNode = this.graph.getNode(edge.to.node)
    if (!fromNode || !toNode) return
    const fromPin = fromNode.pins.find((p) => p.id === edge.from.pin)
    if (!fromPin) return
    this.commandBus.apply(new ConnectPins(edge))
    const fromPos = this.#pinWorldPosition(fromNode, String(edge.from.pin))
    const toPos = this.#pinWorldPosition(toNode, String(edge.to.pin))
    if (!fromPos || !toPos) return
    const opts: RenderEdgeOptions = { sourceType: String(fromPin.type) }
    const gfx = this.#renderEdge(fromPos, toPos, opts)
    this.#edgesLayer.addChild(gfx)
    this.#edgeRecords.set(edge.id, { edge, graphics: gfx, opts })
  }

  #endNodeDrag(altOnRelease: boolean): void {
    if (this.#dragState.kind === 'pending') {
      this.#dragState = { kind: 'idle' }
      return
    }
    if (this.#dragState.kind !== 'active') return

    const snap = altOnRelease || this.#dragState.alt ? null : this.#snapSize
    const state = this.#dragState
    const movedIds = [...state.initialPositions.keys()]
    const affected = state.affectedEdges
    const anchorInitial = state.initialPositions.get(state.anchorId)
    const anchorView = this.#views.get(state.anchorId)
    const rawDelta = anchorInitial && anchorView
      ? {
          x: anchorView.container.position.x - anchorInitial.x,
          y: anchorView.container.position.y - anchorInitial.y,
        }
      : { x: 0, y: 0 }
    const finalDelta = anchorInitial
      ? computeGroupSnappedDelta(anchorInitial, rawDelta, snap)
      : rawDelta

    this.commandBus.transaction(() => {
      for (const [id, initial] of state.initialPositions) {
        const view = this.#views.get(id)
        if (!view) continue
        const target = { x: initial.x + finalDelta.x, y: initial.y + finalDelta.y }
        view.container.position.set(target.x, target.y)
        this.commandBus.apply(new MoveNode(id, target))
      }
    })

    this.#dragState = { kind: 'idle' }
    void movedIds
    // Sync edges to the now-committed positions.
    for (const edgeId of affected) this.#redrawEdge(edgeId)
  }
}

// Keep an unused PIXI re-export bound so TS doesn't tree-shake the symbol away.
void (PixiEventEmitter as unknown)
