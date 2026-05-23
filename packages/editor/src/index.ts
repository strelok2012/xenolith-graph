import { Application, Container, EventEmitter as PixiEventEmitter, FederatedPointerEvent, Graphics, RenderTexture, type ContainerChild, type TextureSource } from 'pixi.js'
import {
  AddNode,
  CommandBus,
  ConnectPins,
  DisconnectEdge,
  EventEmitter,
  Graph,
  MoveNode,
  RemoveNode,
  Selection,
  createEdgeId,
  createNodeId,
  createPinId,
  type CoreEvents,
  type Edge,
  type EdgeId,
  type Node,
  type NodeId,
  type Pin,
  type PinId,
} from '@xenolith/core'
import {
  clearGlowTextureCache,
  computeNodeLayout,
  computeOverlapBackdropPlan,
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
import {
  parseXenolithGraph,
  serializeXenolithGraph,
  type XenolithGraphV1,
} from './serialize.js'

export {
  parseXenolithGraph,
  serializeXenolithGraph,
  XENOLITH_GRAPH_VERSION,
} from './serialize.js'
export type {
  XenolithGraphV1,
  XenolithNodeV1,
  XenolithPinV1,
  XenolithEdgeV1,
  XenolithGraphVersion,
} from './serialize.js'

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
  /** Cached endpoint coords of the last drawn path. If the next frame's endpoints match these,
   *  the bezier path hasn't moved and we can skip the redraw entirely — the dominant cost on
   *  edge-heavy graphs where most edges are static between frames. */
  lastFromX?: number
  lastFromY?: number
  lastToX?:   number
  lastToY?:   number
}

interface ClipboardSnapshot {
  nodes: Node[]
  edges: Edge[]
  renderOpts: Map<NodeId, RenderNodeOptions>
  edgeOpts:   Map<EdgeId, RenderEdgeOptions>
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
  readonly #host: HTMLElement
  /** Toggleable stats overlay (FPS, nodes, edges, selection, zoom). Hidden by default; press
   *  backtick (`) to toggle, or call `setStatsVisible()`. */
  #statsEl: HTMLDivElement | null = null
  #statsVisible = false
  #statsFrame = 0
  #theme: XenolithTheme
  #gridLayer: Container | null = null
  /** Live snapshot of the world MINUS the nodes layer — created lazily the first time the
   *  active theme opts in via `theme.needsBackdrop = true`. Themes that don't sample the
   *  backdrop pay zero extra render cost. */
  #backdropRT: RenderTexture | null = null
  /** Per-node personal backdrop RTs for painter's-order compositing — allocated lazily for
   *  nodes whose AABB overlaps a lower-paint-order node, so the glass shader refracts what's
   *  visually underneath. Nodes with no overlap reuse the shared `#backdropRT`. */
  readonly #perNodeBackdropRT = new Map<NodeId, RenderTexture>()
  /** Last frame's overlap plan — used to revert nodes that stopped overlapping back to the
   *  shared backdrop via `onNodeBackdrop(id, null)`. */
  #lastOverlapPlan = new Map<string, string[]>()
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
  /** Render opts per edge, kept persistent so undo of a DisconnectEdge can re-materialise the
   *  edge graphics with the same wire colour / type hint it had before. */
  readonly #edgeOpts = new Map<EdgeId, RenderEdgeOptions>()
  /** In-memory clipboard buffer set by `copySelection()` and consumed by `paste()`. Stores
   *  references to live node/edge objects + render opts at copy time — survives selection
   *  changes but not editor disposal. We skip JSON serialise/parse on the clipboard path; that
   *  cost showed up clearly in profiling at high node counts. */
  #clipboard: ClipboardSnapshot | null = null
  /** Most recent pointer position in world coords — used by paste-at-cursor and the
   *  ":pointermove" hook. */
  #lastPointerWorld: { x: number; y: number } | null = null
  readonly #coreEvents = new EventEmitter<CoreEvents>()
  #hoveredId: NodeId | null = null
  readonly #marqueeHovered = new Set<NodeId>()
  #dragState: DragState = { kind: 'idle' }

  private constructor(app: Application, host: HTMLElement, theme: XenolithTheme, opts: XenolithEditorOptions) {
    this.#app = app
    this.#host = host
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

    // View-sync: after every command apply/undo/redo, reconcile views with the graph model so
    // undo of a Move/Connect/Remove visually reverts the canvas. We defer the reconcile to a
    // microtask so a transaction that fires N command:applied events collapses to one O(N) sync
    // instead of N × O(N+E) = O(N²) — critical for paste/duplicate at high node counts.
    const scheduleSync = (): void => this.#scheduleSync()
    this.#coreEvents.on('command:applied', scheduleSync)
    this.#coreEvents.on('command:undone',  scheduleSync)
    this.#coreEvents.on('command:redone',  scheduleSync)

    // Redraw every edge each frame so collapse/expand animations track pin positions live.
    // The cost is one drawEdge per edge per frame — cheap on Graphics in PIXI v8.
    app.ticker.add(() => {
      for (const edgeId of this.#edgeRecords.keys()) this.#redrawEdge(edgeId)
      this.#updateBackdrop()
      this.#theme.onFrame?.(this.#themeContext())
      if (this.#statsVisible) this.#tickStats()
    })
  }

  /** Show or hide the stats overlay (FPS, node/edge/selection counts, zoom). Hotkey: backtick.
   *  No render cost when hidden — the overlay is detached from the DOM. */
  setStatsVisible(visible: boolean): void {
    if (visible === this.#statsVisible) return
    this.#statsVisible = visible
    if (visible) {
      if (!this.#statsEl) this.#statsEl = this.#createStatsOverlay()
      // Ensure overlay positions relative to the host, not the page.
      if (getComputedStyle(this.#host).position === 'static') {
        this.#host.style.position = 'relative'
      }
      this.#host.appendChild(this.#statsEl)
      this.#statsFrame = 0
      this.#tickStats()
    } else if (this.#statsEl?.parentElement) {
      this.#statsEl.parentElement.removeChild(this.#statsEl)
    }
  }
  toggleStats(): void { this.setStatsVisible(!this.#statsVisible) }

  #createStatsOverlay(): HTMLDivElement {
    const el = document.createElement('div')
    el.setAttribute('data-xeno-stats', '')
    Object.assign(el.style, {
      position:        'absolute',
      top:             '12px',
      right:           '12px',
      zIndex:          '1000',
      fontFamily:      'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize:        '11px',
      lineHeight:      '1.5',
      color:           'rgba(255, 255, 255, 0.92)',
      background:      'rgba(0, 0, 0, 0.55)',
      backdropFilter:  'blur(8px)',
      border:          '1px solid rgba(255, 255, 255, 0.12)',
      borderRadius:    '6px',
      padding:         '8px 12px',
      pointerEvents:   'none',
      whiteSpace:      'pre',
      userSelect:      'none',
    })
    return el
  }

  #tickStats(): void {
    // Throttle DOM updates to ~10 Hz so the readout stays legible and we don't burn CPU on
    // textContent assignment 60 times a second.
    this.#statsFrame++
    if (this.#statsFrame % 6 !== 0) return
    const el = this.#statsEl
    if (!el) return
    const fps  = this.#app.ticker.FPS.toFixed(0).padStart(3)
    const ms   = this.#app.ticker.deltaMS.toFixed(1).padStart(5)
    const vp   = this.#viewport.state
    el.textContent =
      `FPS    ${fps}  (${ms} ms)\n` +
      `Nodes  ${this.graph.nodeCount}\n` +
      `Edges  ${this.graph.edgeCount}\n` +
      `Sel    ${this.selection.size}\n` +
      `Zoom   ${vp.zoom.toFixed(2)}`
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
    return new XenolithEditor(app, el, theme, opts)
  }

  // ----- theme hook wrappers ---------------------------------------------------------------
  // Every visual element goes through these so that #theme.<hook> wins when present, with the
  // built-in Xen renderer as a fallback. Keeps the rest of the editor agnostic to which theme
  // is currently active.

  #renderNode(node: Node, opts: RenderNodeOptions): NodeView {
    const enriched: RenderNodeOptions = { ...opts, renderer: this.#app.renderer as never }
    return this.#theme.renderNode?.(node, enriched, this.#themeContext()) ?? renderNode(node, this.#theme.tokens, enriched)
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

  /** Render the world for backdrop sampling. Painter's-order compositing:
   *
   *   1. Shared base backdrop = world minus nodes (edges, grid, comments). One RT.
   *   2. AABB-overlap plan via `computeOverlapBackdropPlan` against paint-order list of nodes.
   *      Nodes with no lower-overlapping neighbours share the base RT (cheap path).
   *   3. For each overlapping node in paint order: render base + lower-overlapping neighbours
   *      into a personal RT, then notify the theme via `onNodeBackdrop(id, source)`. Lower
   *      neighbours are already rendered with their own current backdrop textures (we process
   *      bottom-up), so the composition refracts correctly through multiple stacked glass nodes.
   *   4. Nodes that left the plan since last frame are reset to the shared backdrop via
   *      `onNodeBackdrop(id, null)`.
   *
   * No-op when the active theme has `needsBackdrop = false`. */
  #updateBackdrop(): void {
    if (!this.#backdropRT) return
    const sw = Math.max(1, this.#app.screen.width)
    const sh = Math.max(1, this.#app.screen.height)
    if (this.#backdropRT.width !== sw || this.#backdropRT.height !== sh) {
      this.#backdropRT.resize(sw, sh)
      for (const rt of this.#perNodeBackdropRT.values()) rt.resize(sw, sh)
    }

    // Paint-order list of node IDs with their world-space AABBs. During a drag we use the
    // container.position (live, snap-aware) instead of node.position (only committed on drop)
    // so overlap detection works during the drag, not after.
    const rects: { id: string; x: number; y: number; width: number; height: number }[] = []
    const containerById = new Map<string, Container>()
    for (const [id, view] of this.#views) {
      const node = this.graph.getNode(id)
      if (!node) continue
      const size = node.size ?? { x: 150, y: 70 }
      rects.push({
        id:     String(id),
        x:      view.container.position.x,
        y:      view.container.position.y,
        width:  size.x,
        height: size.y,
      })
      containerById.set(String(id), view.container)
    }
    const plan = computeOverlapBackdropPlan(rects)

    // Pass 1 — shared base backdrop: hide every node, render stage, restore.
    const nodesWereVisible = this.#nodesLayer.visible
    this.#nodesLayer.visible = false
    this.#app.renderer.render({ container: this.#app.stage, target: this.#backdropRT })
    this.#nodesLayer.visible = nodesWereVisible

    // Pass 2 — per-overlapping-node personal backdrops. Restore nodesLayer; we'll toggle
    // individual node containers' visibility instead of hiding the whole layer.
    if (plan.size > 0) {
      const visBackup = new Map<string, boolean>()
      for (const [id, container] of containerById) {
        visBackup.set(id, container.visible)
        container.visible = false
      }
      // Iterate plan in paint order so lower nodes' personal RTs are committed before higher
      // nodes that depend on them render. Map iteration order matches insertion order which
      // matches the paint-order loop in computeOverlapBackdropPlan.
      for (const [nodeId, lowerIds] of plan) {
        let rt = this.#perNodeBackdropRT.get(nodeId as NodeId)
        if (!rt) {
          rt = RenderTexture.create({
            width:      sw,
            height:     sh,
            resolution: this.#app.renderer.resolution,
            antialias:  true,
          })
          this.#perNodeBackdropRT.set(nodeId as NodeId, rt)
        }
        for (const lid of lowerIds) {
          const c = containerById.get(lid)
          if (c) c.visible = true
        }
        this.#app.renderer.render({ container: this.#app.stage, target: rt })
        for (const lid of lowerIds) {
          const c = containerById.get(lid)
          if (c) c.visible = false
        }
        this.#theme.onNodeBackdrop?.(nodeId, rt.source)
      }
      // Restore.
      for (const [id, container] of containerById) {
        container.visible = visBackup.get(id) ?? true
      }
    }

    // Nodes that were in last frame's plan but not this frame: revert to shared backdrop.
    // We pass the shared backdrop source explicitly (not null) so the theme just swaps the
    // mesh's uBackdropTex back to it — passing null would fall back to Texture.WHITE and the
    // glass body would render as a blank pale rectangle.
    const sharedSource = this.#backdropRT.source
    for (const oldId of this.#lastOverlapPlan.keys()) {
      if (!plan.has(oldId)) {
        this.#theme.onNodeBackdrop?.(oldId, sharedSource)
        const rt = this.#perNodeBackdropRT.get(oldId as NodeId)
        if (rt) {
          rt.destroy(true)
          this.#perNodeBackdropRT.delete(oldId as NodeId)
        }
      }
    }
    this.#lastOverlapPlan = plan
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
    const fromPinModel = fromNode.pins[fromPinIndex]!
    const toPinModel = toNode.pins[toPinIndex]!
    const edge: Edge = {
      id: createEdgeId(),
      from: { node: fromNode.id, pin: fromPinModel.id },
      to:   { node: toNode.id,   pin: toPinModel.id   },
    }
    this.graph._addEdge(edge)
    this.#materializeEdge(edge, opts)
    return edge.id
  }

  /** Serialize the current graph (nodes + edges + render opts + viewport) into the canonical
   *  `xenolith.v1` envelope. The returned object is JSON-safe. */
  toJSON(): XenolithGraphV1 {
    return serializeXenolithGraph({
      nodes:      Array.from(this.graph.nodes()),
      edges:      Array.from(this.graph.edges()),
      renderOpts: this.#renderOpts as ReadonlyMap<NodeId, RenderNodeOptions>,
      edgeOpts:   new Map(Array.from(this.#edgeRecords).map(([id, r]) => [id, r.opts])),
      viewport:   this.#viewport.state,
    })
  }

  /** Replace the editor's contents with the contents of an `xenolith.v1` payload. Wipes the
   *  existing graph, selection, and viewport before reloading. Throws on malformed input — the
   *  editor is left in its previous state in that case. */
  loadJSON(data: unknown): void {
    const parsed = parseXenolithGraph(data)
    this.#clearAll()
    for (const node of parsed.nodes) {
      const render = parsed.renderOpts.get(String(node.id)) ?? {}
      this.addNode(node, render)
    }
    for (const edge of parsed.edges) {
      const opts = parsed.edgeOpts.get(String(edge.id)) ?? {}
      this.#loadEdge(edge, opts)
    }
    if (parsed.viewport) this.#viewport.setState(parsed.viewport)
  }

  /** Re-attach a deserialized edge using its preserved id and pin-id endpoints — bypasses the
   *  fresh-edge-id path of public `connect()`. */
  #loadEdge(edge: Edge, opts: RenderEdgeOptions): void {
    this.graph._addEdge(edge)
    if (!this.#materializeEdge(edge, opts)) this.graph._removeEdge(edge.id)
  }

  #clearAll(): void {
    for (const { graphics } of this.#edgeRecords.values()) graphics.destroy()
    this.#edgeRecords.clear()
    this.#edgeOpts.clear()
    for (const view of this.#views.values()) view.container.destroy({ children: true })
    this.#views.clear()
    this.#renderOpts.clear()
    for (const id of Array.from(this.graph.nodes()).map((n) => n.id)) this.graph._removeNode(id)
    for (const id of Array.from(this.graph.edges()).map((e) => e.id)) this.graph._removeEdge(id)
    this.selection.clear()
    this.#hoveredId = null
    this.#marqueeHovered.clear()
    for (const rt of this.#perNodeBackdropRT.values()) rt.destroy(true)
    this.#perNodeBackdropRT.clear()
    this.#lastOverlapPlan = new Map()
    this.#clipboard = null
  }

  /** Undo the most recent committed command (drag-drop MoveNode, ConnectPins from pin-drag, etc).
   *  Returns true if anything was undone. View sync happens automatically via the
   *  `command:undone` listener. */
  undo(): boolean { return this.commandBus.undo() }
  /** Redo the most recently undone command. Returns true if anything was redone. */
  redo(): boolean { return this.commandBus.redo() }

  /** Delete every selected node along with its incident edges. Each removal goes through
   *  `RemoveNode` so the whole operation is undoable as a single transaction. */
  deleteSelected(): void {
    const ids = this.selection.ids().slice()
    if (ids.length === 0) return
    this.commandBus.transaction(() => {
      for (const id of ids) this.commandBus.apply(new RemoveNode(id))
    })
  }

  /** Capture the current selection into the in-memory clipboard. Pins and edges between selected
   *  nodes are preserved; edges that cross out of the selection are dropped. */
  copySelection(): boolean {
    const snapshot = this.#snapshotSelection()
    if (!snapshot) return false
    this.#clipboard = snapshot
    return true
  }

  /** Paste the in-memory clipboard's nodes/edges into the graph with fresh IDs.
   *
   *  - `target = { x, y }` — world point where the clipboard's centroid should land
   *    (paste-at-cursor); use `editor.lastPointerWorld()` from the keyboard handler.
   *  - `target = { dx, dy }` — fixed offset from the original positions (legacy behaviour).
   *  - default — offset (+24, +24).
   *
   *  Newly added nodes replace the current selection. Returns the new node IDs. */
  paste(target?: { x: number; y: number } | { dx: number; dy: number }): NodeId[] {
    if (!this.#clipboard) return []
    return this.#cloneSnapshot(this.#clipboard, target)
  }

  /** Cmd+D — clone the current selection in place with an offset, replace selection with the
   *  clones. Independent of the clipboard. */
  duplicateSelected(offset: { dx: number; dy: number } = { dx: 24, dy: 24 }): NodeId[] {
    const snapshot = this.#snapshotSelection()
    if (!snapshot) return []
    return this.#cloneSnapshot(snapshot, offset)
  }

  /** Last known cursor position in world coordinates, or null if pointer hasn't moved over the
   *  canvas yet. Exposed so external keyboard handlers can drive paste-at-cursor. */
  lastPointerWorld(): { x: number; y: number } | null {
    return this.#lastPointerWorld ? { ...this.#lastPointerWorld } : null
  }

  #snapshotSelection(): ClipboardSnapshot | null {
    const ids = new Set(this.selection.ids())
    if (ids.size === 0) return null
    const nodes: Node[] = []
    const renderOpts = new Map<NodeId, RenderNodeOptions>()
    for (const n of this.graph.nodes()) {
      if (!ids.has(n.id)) continue
      nodes.push(n as Node)
      const r = this.#renderOpts.get(n.id)
      if (r) renderOpts.set(n.id, { ...r })
    }
    const edges: Edge[] = []
    const edgeOpts = new Map<EdgeId, RenderEdgeOptions>()
    for (const e of this.graph.edges()) {
      if (!ids.has(e.from.node) || !ids.has(e.to.node)) continue
      edges.push(e as Edge)
      const o = this.#edgeOpts.get(e.id)
      if (o) edgeOpts.set(e.id, { ...o })
    }
    return { nodes, edges, renderOpts, edgeOpts }
  }

  /** In-process clone of a snapshot. Re-IDs every node/pin/edge, rewires edges to the new pin
   *  IDs, applies as a single transaction (one microtask-batched view sync at the end). */
  #cloneSnapshot(
    snap: ClipboardSnapshot,
    target?: { x: number; y: number } | { dx: number; dy: number },
  ): NodeId[] {
    if (snap.nodes.length === 0) return []
    let translate: { dx: number; dy: number }
    if (target && 'dx' in target) {
      translate = { dx: target.dx, dy: target.dy }
    } else if (target && 'x' in target) {
      // Centroid → target point.
      let cx = 0, cy = 0
      for (const n of snap.nodes) { cx += n.position.x; cy += n.position.y }
      cx /= snap.nodes.length
      cy /= snap.nodes.length
      translate = { dx: target.x - cx, dy: target.y - cy }
    } else {
      translate = { dx: 24, dy: 24 }
    }

    const nodeIdMap = new Map<NodeId, NodeId>()
    const pinIdMap  = new Map<PinId, PinId>()
    const newNodes: Node[] = []
    for (const oldNode of snap.nodes) {
      const newNodeId = createNodeId()
      nodeIdMap.set(oldNode.id, newNodeId)
      const newPins: Pin[] = oldNode.pins.map((p) => {
        const newPinId = createPinId()
        pinIdMap.set(p.id as PinId, newPinId)
        return { ...p, id: newPinId }
      })
      const clone: Node = {
        ...oldNode,
        id: newNodeId,
        position: { x: oldNode.position.x + translate.dx, y: oldNode.position.y + translate.dy },
        pins: newPins,
        state: { ...oldNode.state },
      }
      if (oldNode.size) clone.size = { ...oldNode.size }
      newNodes.push(clone)
      const render = snap.renderOpts.get(oldNode.id)
      if (render) this.#renderOpts.set(newNodeId, { ...render })
    }
    const newEdges: Edge[] = []
    for (const oldEdge of snap.edges) {
      const fromNode = nodeIdMap.get(oldEdge.from.node)
      const toNode   = nodeIdMap.get(oldEdge.to.node)
      const fromPin  = pinIdMap.get(oldEdge.from.pin as PinId)
      const toPin    = pinIdMap.get(oldEdge.to.pin   as PinId)
      if (!fromNode || !toNode || !fromPin || !toPin) continue
      const newEdgeId = createEdgeId()
      newEdges.push({
        id: newEdgeId,
        from: { node: fromNode, pin: fromPin },
        to:   { node: toNode,   pin: toPin   },
      })
      const opts = snap.edgeOpts.get(oldEdge.id)
      if (opts) this.#edgeOpts.set(newEdgeId, { ...opts })
    }
    this.commandBus.transaction(() => {
      for (const node of newNodes) this.commandBus.apply(new AddNode(node))
      for (const edge of newEdges) this.commandBus.apply(new ConnectPins(edge))
    })
    this.selection.replaceWith(newNodes.map((n) => n.id))
    return newNodes.map((n) => n.id)
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

    // Drop baked glow textures — geometry tokens (radii, sizes via padding) may have changed,
    // and any cached strokes from the previous theme would render with stale dimensions.
    clearGlowTextureCache()

    // Invalidate per-edge endpoint cache so the ticker repaints every wire with the new theme's
    // drawEdge (colour / tension / etc) on the next frame — without this the skip-on-unchanged
    // optimisation would keep showing the previous theme's wires until something moves.
    for (const rec of this.#edgeRecords.values()) {
      delete rec.lastFromX
      delete rec.lastFromY
      delete rec.lastToX
      delete rec.lastToY
    }

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
      return
    }

    // Don't intercept when a text field has focus.
    const target = e.target as { tagName?: string; isContentEditable?: boolean } | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return
    }

    const mod = e.metaKey || e.ctrlKey

    if (!mod && e.key === '`') {
      e.preventDefault()
      this.toggleStats()
      return
    }
    if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
      if (this.selection.size === 0) return
      e.preventDefault()
      this.deleteSelected()
      return
    }
    if (mod && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
      e.preventDefault()
      this.undo()
      return
    }
    if (mod && ((e.key === 'z' || e.key === 'Z') && e.shiftKey || e.key === 'y' || e.key === 'Y')) {
      e.preventDefault()
      this.redo()
      return
    }
    if (mod && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault()
      this.duplicateSelected()
      return
    }
    if (mod && (e.key === 'c' || e.key === 'C')) {
      if (this.selection.size === 0) return
      e.preventDefault()
      this.copySelection()
      return
    }
    if (mod && (e.key === 'v' || e.key === 'V')) {
      if (!this.#clipboard) return
      e.preventDefault()
      const at = this.#lastPointerWorld
      this.paste(at ?? undefined)
      return
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
    // Skip the expensive bezier-sample + Graphics clear/stroke when endpoints haven't moved.
    // Catches both idle frames (zero edge work on a static graph) and the non-dragging edges
    // during a multi-node drag. Triggers naturally on collapse animation because
    // pinLocalPosition shifts each animation frame.
    if (
      rec.lastFromX === fromPos.x && rec.lastFromY === fromPos.y &&
      rec.lastToX   === toPos.x   && rec.lastToY   === toPos.y
    ) return
    this.#drawEdge(rec.graphics, fromPos, toPos, rec.opts)
    rec.lastFromX = fromPos.x
    rec.lastFromY = fromPos.y
    rec.lastToX   = toPos.x
    rec.lastToY   = toPos.y
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

  /** Materialise an edge's Graphics from the model. Used by `connect()`, `#loadEdge()`, and the
   *  command-driven sync path. Resolves pin layouts and writes an EdgeRecord into `#edgeRecords`.
   *  Returns false if either endpoint is missing (stale edge in the model). */
  #materializeEdge(edge: Edge, opts: RenderEdgeOptions): boolean {
    const fromNode = this.graph.getNode(edge.from.node)
    const toNode   = this.graph.getNode(edge.to.node)
    if (!fromNode || !toNode) return false
    const fromIdx = fromNode.pins.findIndex((p) => p.id === edge.from.pin)
    const toIdx   = toNode.pins.findIndex((p) => p.id === edge.to.pin)
    if (fromIdx < 0 || toIdx < 0) return false
    const fromPin = this.#pinLayoutFor(fromNode, fromIdx)
    const toPin   = this.#pinLayoutFor(toNode,   toIdx)
    const gfx = this.#renderEdge(fromPin, toPin, opts)
    this.#edgesLayer.addChild(gfx)
    this.#edgeRecords.set(edge.id, { edge, graphics: gfx, opts })
    this.#edgeOpts.set(edge.id, opts)
    return true
  }

  #syncPending = false

  /** Queue a single `#syncFromGraph()` for the next microtask. Idempotent — many calls in one
   *  synchronous tick (e.g. a transaction firing N command:applied events) collapse into one
   *  reconcile, turning paste/duplicate from O(N²) into O(N). */
  #scheduleSync(): void {
    if (this.#syncPending) return
    this.#syncPending = true
    queueMicrotask(() => {
      this.#syncPending = false
      this.#syncFromGraph()
    })
  }

  /** Reconcile views with the graph model. Called after every command apply/undo/redo so that
   *  user-driven mutations (Delete, Cmd+Z, Cmd+D, paste) immediately reflect on the canvas. */
  #syncFromGraph(): void {
    const seenNodes = new Set<NodeId>()
    for (const node of this.graph.nodes()) {
      seenNodes.add(node.id)
      let view = this.#views.get(node.id)
      if (!view) {
        const opts = this.#renderOpts.get(node.id) ?? {}
        view = this.#renderNode(node, opts)
        this.#views.set(node.id, view)
        this.#nodesLayer.addChild(view.container)
        this.#wireNodeInteraction(node.id, view)
      }
      view.container.position.set(node.position.x, node.position.y)
    }
    let droppedFromSelection = false
    for (const [id, view] of Array.from(this.#views)) {
      if (seenNodes.has(id)) continue
      view.container.destroy({ children: true })
      this.#views.delete(id)
      if (this.selection.contains(id)) droppedFromSelection = true
      this.#marqueeHovered.delete(id)
      if (this.#hoveredId === id) this.#hoveredId = null
    }
    if (droppedFromSelection) {
      this.selection.replaceWith(this.selection.ids().filter((id) => seenNodes.has(id)))
    }

    const seenEdges = new Set<EdgeId>()
    for (const edge of this.graph.edges()) {
      seenEdges.add(edge.id)
      if (this.#edgeRecords.has(edge.id)) continue
      this.#materializeEdge(edge as Edge, this.#edgeOpts.get(edge.id) ?? {})
    }
    for (const id of Array.from(this.#edgeRecords.keys())) {
      if (!seenEdges.has(id)) this.#disposeEdgeGraphics(id)
    }
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
      this.#lastPointerWorld = screenToWorld(current, this.#viewport.state)

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
        const opts: RenderEdgeOptions = { sourceType: String(outPin.type) }
        this.#edgeOpts.set(edge.id, opts)
        this.commandBus.apply(new ConnectPins(edge))
        committed = true
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
    if (!fromNode) return
    const fromPin = fromNode.pins.find((p) => p.id === edge.from.pin)
    if (!fromPin) return
    const opts: RenderEdgeOptions = { sourceType: String(fromPin.type) }
    this.#edgeOpts.set(edge.id, opts)
    this.commandBus.apply(new ConnectPins(edge))
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
