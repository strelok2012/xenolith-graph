import { Application, Container, EventEmitter as PixiEventEmitter, FederatedPointerEvent, Graphics, type ContainerChild } from 'pixi.js'
import {
  CommandBus,
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
} from '@xenolith/core'
import {
  computeNodeLayout,
  createGridSprite,
  drawEdge,
  InteractionManager,
  nodeBounds,
  rectFromPoints,
  rectIntersects,
  renderEdge,
  renderNode,
  computeDragTarget,
  screenToWorld,
  Viewport,
  type NodeView,
  type PinLayout,
  type RenderEdgeOptions,
  type RenderNodeOptions,
  type ViewportState,
  type ZoomBounds,
} from '@xenolith/render-pixi'
import { xenTokens, loadXenFonts, mergeTheme, type DeepPartial, type XenTokens } from '@xenolith/theme-xen'

export const VERSION = '0.0.0'

const MARQUEE_DRAG_THRESHOLD = 4
const NODE_DRAG_THRESHOLD = 4

export interface XenolithEditorOptions {
  /** Partial override of the default Xen theme. Deep-merged with `xenTokens`. */
  theme?: DeepPartial<XenTokens>
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
      initialPositions: Map<NodeId, { x: number; y: number }>
      affectedEdges: Set<EdgeId>
      alt: boolean
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
  readonly #theme: XenTokens
  readonly #world: Container<ContainerChild>
  readonly #edgesLayer: Container<ContainerChild>
  readonly #nodesLayer: Container<ContainerChild>
  readonly #viewport: Viewport
  readonly #interaction: InteractionManager | null
  readonly #zoomBounds: ZoomBounds
  readonly #snapSize: number
  readonly #views = new Map<NodeId, NodeView>()
  readonly #edgeRecords = new Map<EdgeId, EdgeRecord>()
  readonly #coreEvents = new EventEmitter<CoreEvents>()
  #hoveredId: NodeId | null = null
  readonly #marqueeHovered = new Set<NodeId>()
  #dragState: DragState = { kind: 'idle' }

  private constructor(app: Application, theme: XenTokens, opts: XenolithEditorOptions) {
    this.#app = app
    this.#theme = theme
    this.graph = new Graph()
    this.selection = new Selection()
    this.commandBus = new CommandBus({ graph: this.graph, events: this.#coreEvents })
    this.#zoomBounds = opts.zoomBounds ?? [0.25, 2]
    this.#snapSize = opts.snap ?? 8

    this.#world = new Container({ label: 'world' })
    this.#edgesLayer = new Container({ label: 'edges' })
    this.#nodesLayer = new Container({ label: 'nodes' })
    if (!opts.disableGrid) {
      this.#world.addChild(createGridSprite(theme))
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
    } else {
      this.#interaction = null
    }

    this.selection.on(() => this.#updateVisualStates())

    // Redraw every edge each frame so collapse/expand animations track pin positions live.
    // The cost is one drawEdge per edge per frame — cheap on Graphics in PIXI v8.
    app.ticker.add(() => {
      for (const edgeId of this.#edgeRecords.keys()) this.#redrawEdge(edgeId)
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
    const theme = opts.theme ? mergeTheme(xenTokens, opts.theme) : xenTokens
    const app = new Application()
    const initOpts: Parameters<Application['init']>[0] = {
      background: opts.background ?? theme.color.surface.canvas,
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

  addNode(node: Node, render: RenderNodeOptions = {}): Node {
    this.graph._addNode(node)
    const view = renderNode(node, this.#theme, render)
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
    const gfx = renderEdge(fromPin, toPin, this.#theme, opts)
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
  get theme(): XenTokens { return this.#theme }

  destroy(): void {
    this.#interaction?.detach()
    this.#app.destroy(true, { children: true })
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
      node:   this.#theme.geometry.node,
      pin:    {
        diameter:   this.#theme.geometry.pin.diameter,
        rowSpacing: this.#theme.geometry.pin.rowSpacing,
        rowHeight:  this.#theme.geometry.pin.rowHeight,
      },
      header: { toPinsGap: this.#theme.geometry.header.toPinsGap },
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
    drawEdge(rec.graphics, fromPos, toPos, this.#theme, rec.opts)
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
      if (e.button !== 0 || e.target !== stage) return
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
        // feel. Hold Alt at any point during the drag to disable.
        const snap = e.altKey || this.#dragState.alt ? null : this.#snapSize
        for (const [id, initial] of this.#dragState.initialPositions) {
          const view = this.#views.get(id)
          if (!view) continue
          const target = computeDragTarget(initial, worldDelta, snap)
          view.container.position.set(target.x, target.y)
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
          if (rectIntersects(rect, nodeBounds(node, this.#theme))) {
            this.#marqueeHovered.add(node.id)
          }
        }
        this.#updateVisualStates()
      }
    })

    const endStage = (e: FederatedPointerEvent): void => {
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
        if (rectIntersects(rect, nodeBounds(node, this.#theme))) ids.push(node.id)
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
    const ids = this.selection.size > 0 ? this.selection.ids() : [this.#dragState.nodeId]
    for (const id of ids) {
      const node = this.graph.getNode(id)
      if (node) initialPositions.set(id, { ...node.position })
    }
    const affectedEdges = this.#edgesAttachedTo(new Set(initialPositions.keys()))
    this.#dragState = {
      kind: 'active',
      startScreen: this.#dragState.startScreen,
      initialPositions,
      affectedEdges,
      alt,
    }
  }

  #endNodeDrag(altOnRelease: boolean): void {
    if (this.#dragState.kind === 'pending') {
      this.#dragState = { kind: 'idle' }
      return
    }
    if (this.#dragState.kind !== 'active') return

    const snap = altOnRelease || this.#dragState.alt ? null : this.#snapSize
    const movedIds = [...this.#dragState.initialPositions.keys()]
    const affected = this.#dragState.affectedEdges

    this.commandBus.transaction(() => {
      for (const [id, initial] of this.#dragState.kind === 'active'
        ? this.#dragState.initialPositions
        : []) {
        const view = this.#views.get(id)
        if (!view) continue
        const delta = {
          x: view.container.position.x - initial.x,
          y: view.container.position.y - initial.y,
        }
        const target = computeDragTarget(initial, delta, snap)
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
