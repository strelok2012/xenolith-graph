import { Application, BitmapFontManager, Color, Container, EventEmitter as PixiEventEmitter, FederatedPointerEvent, Graphics, Rectangle, RenderTexture, Sprite, Text, Texture, TilingSprite, type ColorSource, type ContainerChild, type TextureSource } from 'pixi.js'
import {
  AddNode,
  CommandBus,
  ConnectPins,
  DisconnectEdge,
  EventEmitter,
  Graph,
  MoveNode,
  AddComment,
  RemoveComment,
  MoveComment,
  ResizeComment,
  SetCommentText,
  nodesInsideComment,
  createCommentId,
  NodeRegistry,
  TypeRegistry,
  RemoveNode,
  Selection,
  SetNodeState,
  isReroute,
  createReroute,
  SetNodePins,
  SetNodeWidgets,
  rerouteNodeSchema,
  REROUTE_NODE_TYPE,
  isMacro,
  createMacro,
  macroMembers,
  flattenMacroProxies,
  flattenAllTemplateInstances,
  planMacroCollapse,
  disconnectedWidgetBoundPins,
  MACRO_TYPE,
  type MacroProxyRecord,
  planTemplateExtraction,
  planTemplateUnpack,
  templateInterface,
  materializeInterface,
  templateDefContains,
  flattenTemplateInstance,
  type FlattenedTemplate,
  isTemplateInstance,
  isTemplateBoundary,
  TEMPLATE_INSTANCE_TYPE,
  TEMPLATE_INPUT_TYPE,
  TEMPLATE_OUTPUT_TYPE,
  type TemplateDefId,
  type TemplateDefinition,
  createEdgeId,
  createNodeId,
  createPinId,
  clampWidgetValue,
  widgetValue,
  widgetBindKey,
  widgetVisibility,
  migrateNodePayload,
  comboOptions,
  type CoreEvents,
  type WidgetStyle,
  type Edge,
  type EdgeId,
  type Node,
  type NodeId,
  type Comment,
  type CommentId,
  type Pin,
  type PinId,
  type PinKind,
  type PinDirection,
  type WidgetSpec,
  type NodeSchema,
  type PinSchema,
  type NodeGlyph,
} from '@xenolith/core'
import {
  bezierMidpoint,
  clearGlowTextureCache,
  clearGradientCache,
  computeEdgePath,
  computeNodeLayout,
  computeOverlapBackdropPlan,
  findPinByKey,
  createGridSprite,
  createPixiTextMeasurer,
  drawEdge,
  measureNodeSize,
  InteractionManager,
  nodeBounds,
  rectFromPoints,
  rectIntersects,
  renderNode,
  IconRegistry,
  renderComment,
  type CommentView,
  renderMacroFrame,
  type MacroFrameView,
  resolveCategoryGradient,
  renderRerouteNode,
  renderRerouteNodeBox,
  rerouteSize,
  rerouteBoxSize,
  computeGroupSnappedDelta,
  computeWidgetRects,
  fitView,
  isDomWidgetController,
  readPinHandle,
  resolvePinFill,
  screenToWorld,
  worldToScreen,
  snapToGrid,
  shouldVirtualize,
  visibleWorldRect,
  lodLevel,
  cellKey,
  cellsForRect,
  type LODLevel,
  type LODThresholds,
  Viewport,
  xenTheme,
  resolveWidgetStyle,
  widgetCssVars,
  themeCssVars,
  type CanvasWidgetController,
  type CustomWidgetController,
  type DomWidgetController,
  type WidgetLayoutTokens,
  type NodeView,
  type WidgetHit,
  type PinHandle,
  type PinLayout,
  type RenderEdgeOptions,
  type RenderNodeOptions,
  type GraphCategoryPalette,
  type NodeSizeTokens,
  type TextMeasurer,
  type ThemeRenderContext,
  type GeomRect,
  type ViewportState,
  type XenolithTheme,
  type ZoomBounds,
} from '@xenolith/render-pixi'
import { xenTokens, loadXenFonts, mergeTheme, type DeepPartial, type XenTokens } from '@xenolith/theme-xen'
import { canConnect } from './pin-compat.js'
import { CommandRegistry } from './commands-registry.js'
import { SidebarManager } from './sidebar.js'
import { PaletteSidebar, type PaletteSidebarOpts } from './palette-sidebar.js'
import { computeRerouteBridges } from './reroute-bridge.js'
import { spliceCompatible, danglingRerouteRemovalPlan } from './edge-insert.js'
import { InsertPalette } from './palette.js'
import { pruneOrphanInlineReroutes } from './clipboard-prune.js'
import { EdgeContextMenu, type EdgeMenuItem } from './edge-menu.js'
import { WidgetOverlay, type OverlayRect } from './widget-overlay.js'
import { Minimap, type MinimapPosition } from './minimap.js'
import { EditorControls, type ControlsOptions, type ControlsPosition } from './controls.js'
import { createGraphEventBridge, firePreventable, type EditorEvents } from './events.js'
import { PluginHost, type PluginContext, type XenolithPlugin } from './plugin.js'
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
  XenolithCommentV1,
  XenolithTemplateV1,
  XenolithGraphVersion,
} from './serialize.js'

export { NodeRegistry } from '@xenolith/core'
export type { NodeSchema, PinSchema, NodeSearchResult, WidgetSpec, WidgetStyle, WidgetType, Node, Edge, NodeId, EdgeId, PinId } from '@xenolith/core'
export type { CustomWidgetController, CanvasWidgetController, DomWidgetController, CustomWidgetContext, ViewportState } from '@xenolith/render-pixi'
export type { MinimapPosition } from './minimap.js'
export type { ControlsOptions, ControlsPosition } from './controls.js'
export type { EditorEvents, PreventablePayload } from './events.js'
export { CommandRegistry, Commands } from './commands-registry.js'
export { StepDebugger } from './step-debugger.js'
export type { StepExecutor, StepRecord, StepDebuggerStatus, StepDebuggerEvents } from './step-debugger.js'
export { diffGraphs } from './graph-diff.js'
export type { GraphDiff, DiffSnapshot, DiffSnapshotNode, DiffSnapshotEdge, DiffOptions } from './graph-diff.js'
export type { CommandSpec, HotkeySpec, CommandId } from './commands-registry.js'
export { SidebarManager } from './sidebar.js'
export type { SidebarManagerOpts } from './sidebar.js'
export { PluginHost } from './plugin.js'
export type { XenolithPlugin, PluginContext } from './plugin.js'
export type { FlattenedTemplate, PinRef } from '@xenolith/core'

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
  /** Show the overview minimap. `true` uses the default (bottom-right) placement; pass an object to
   *  set the corner/edge anchor or exact screen coordinates. Toggle later via `setMinimapVisible`. */
  minimap?: boolean | { position?: MinimapPosition }
  /** Show the built-in viewport controls (zoom / fit / reset / undo·redo / save / lock). `true` uses
   *  defaults; pass an object for position/orientation/which buttons. Toggle later via `setControls`. */
  controls?: boolean | ControlsOptions
  /** Custom connection guard, on top of the built-in type check. Return `false` to reject a wire.
   *  Receives the normalised out→in endpoints. Pair with `wouldCreateCycle` to forbid cycles.
   *  Update at runtime via `setIsValidConnection`. */
  isValidConnection?: (connection: ConnectionRequest) => boolean
}

/** A would-be connection, normalised to out → in, passed to `isValidConnection`. */
export interface ConnectionRequest {
  source: NodeId
  sourcePin: PinId
  target: NodeId
  targetPin: PinId
}

/** Per-node execution status, surfaced as a coloured ring. `running` pulses; `idle` clears it.
 *  Lets a host show graph-execution progress (LLM/audio/pipeline showcases) without a runtime. */
export type NodeStatus = 'idle' | 'running' | 'ok' | 'error'

/** Plain structural snapshot of a node for a host interpreter (no PIXI/view data). */
export interface SnapshotNode {
  id: string
  type: string
  state: Record<string, unknown>
  pins: { id: string; kind: PinKind; direction: PinDirection; type: string; default?: unknown }[]
}
export interface SnapshotEdge {
  from: { node: string; pin: string }
  to: { node: string; pin: string }
}
/** A flat, structural view of the graph for execution — see {@link XenolithEditor.graphSnapshot}. */
export interface GraphSnapshot {
  nodes: SnapshotNode[]
  edges: SnapshotEdge[]
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
  /** Midpoint label Text, created on demand when `opts.label` is set. */
  label?: Text | undefined
  /** Cached endpoint coords of the last drawn path. If the next frame's endpoints match these,
   *  the bezier path hasn't moved and we can skip the redraw entirely — the dominant cost on
   *  edge-heavy graphs where most edges are static between frames. */
  lastFromX?: number | undefined
  lastFromY?: number | undefined
  lastToX?:   number | undefined
  lastToY?:   number | undefined
}

/** Reserved palette type that inserts a comment frame instead of a node. Lives in `#builtins` so it
 *  shows up in the standard insert search; `#insertFromPalette` intercepts it. */
const COMMENT_PALETTE_TYPE = '$comment'
const commentPaletteSchema: NodeSchema = {
  type: COMMENT_PALETTE_TYPE,
  title: 'Comment',
  category: 'Layout',
  description: 'Group nodes in a labelled frame',
  keywords: ['comment', 'group', 'frame', 'note', 'section'],
  pins: [],
}

/** Boundary nodes that declare a template definition's interface — insert one while dived into a
 *  template (Tab → "Input"/"Output"), wire it to a member, and on dive-out it becomes an instance
 *  pin (Blender Group Input/Output style). Rename it (node menu) to label the interface pin. */
const templateInputSchema: NodeSchema = {
  type: TEMPLATE_INPUT_TYPE,
  title: 'Input',
  category: 'utility',
  description: 'Template interface input',
  keywords: ['input', 'port', 'arg', 'parameter', 'template'],
  // The pin's label IS the interface-pin label (rename relabels it); default so a fresh Input/Output
  // gives the instance a labelled pin instead of a blank one.
  pins: [{ kind: 'data', direction: 'out', type: 'any', multiple: true, label: 'In' }],
}
const templateOutputSchema: NodeSchema = {
  type: TEMPLATE_OUTPUT_TYPE,
  title: 'Output',
  category: 'utility',
  description: 'Template interface output',
  keywords: ['output', 'port', 'return', 'result', 'template'],
  pins: [{ kind: 'data', direction: 'in', type: 'any', multiple: false, label: 'Out' }],
}

interface ClipboardSnapshot {
  nodes: Node[]
  edges: Edge[]
  comments: Comment[]
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

/** Multiply a colour's RGB by `f` (<1 darkens) — used to tone down LOD node fills. */
function darkenColor(c: ColorSource, f: number): number {
  const col = new Color(c)
  return new Color([col.red * f, col.green * f, col.blue * f]).toNumber()
}

export class XenolithEditor {
  readonly #rootGraph: Graph
  readonly #rootBus: CommandBus
  /** The graph + bus currently being displayed and edited. Equal to the root document at dive
   *  depth 0; a template definition's own graph + bus while dived into a `$templateInstance`. All
   *  render, interaction, selection, and undo route through these (via the `graph`/`commandBus`
   *  getters). `toJSON`/`loadJSON` stay bound to the root document. */
  #displayGraph: Graph
  #displayBus: CommandBus
  readonly selection: Selection
  /** The active (displayed) graph — the root document at depth 0, a definition while dived. */
  get graph(): Graph { return this.#displayGraph }
  /** The active (displayed) command bus — the root document's bus at depth 0. */
  get commandBus(): CommandBus { return this.#displayBus }
  readonly #app: Application
  /** True after `destroy()` runs. PIXI's `app.screen` getter throws on a destroyed Application
   *  instead of returning null, so we gate every access on this flag. */
  #destroyed = false
  readonly #host: HTMLElement
  /** Toggleable stats overlay (FPS, nodes, edges, selection, zoom). Hidden by default; press
   *  backtick (`) to toggle, or call `setStatsVisible()`. */
  #statsEl: HTMLDivElement | null = null
  #statsVisible = false
  #statsFrame = 0
  /** Themeable "Rendering…" busy overlay shown over the canvas during heavy loads so the first
   *  (blocking) render of a big graph is hidden behind a blur + spinner, then faded out. */
  #overlayEl: HTMLDivElement | null = null
  #overlayCard: HTMLDivElement | null = null
  #overlaySpinner: HTMLDivElement | null = null
  #overlayLabel: HTMLDivElement | null = null
  /** Render-on-demand dirty flag. The ticker only repaints (and reruns edge redraw + backdrop +
   *  shader onFrame) on frames where this is set. A static graph costs ~0 — no GPU work, no
   *  shader passes. Starts true so the first frame paints. */
  #needsRender = true
  /** Ids of edges with `animated: true`. While non-empty the ticker advances `#dashPhase` and marks
   *  the scene dirty every frame; empty → the graph stays render-on-demand idle. */
  readonly #animatedEdges = new Set<EdgeId>()
  #dashPhase = 0
  #theme: XenolithTheme
  #gridLayer: Container | null = null
  /** Live snapshot of the world MINUS the nodes layer — created lazily the first time the
   *  active theme opts in via `theme.needsBackdrop = true`. Themes that don't sample the
   *  backdrop pay zero extra render cost. */
  #backdropRT: RenderTexture | null = null
  /** World-space ring shown over the edge midpoint dot the cursor is hovering (affordance for the
   *  right-click menu). Null target = hidden. */
  #edgeHoverGfx!: Graphics
  #hoveredEdgeMid: EdgeId | null = null
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
  readonly #lodLayer: Container<ContainerChild>
  #commentsLayer!: Container
  #commentHeadersLayer!: Container
  #macroFramesLayer!: Container
  /** Top layer (above nodes): an EXPANDED macro's frame + member views are reparented here so the
   *  whole group paints over everything else. Nested macros stack by depth within it. */
  #macroOverlayLayer!: Container
  readonly #macroFrames = new Map<NodeId, MacroFrameView>()
  /** Macros mid expand-animation. Their members + frame are primed invisible by the next sync (before
   *  paint) so the grow-in starts from nothing — without this one full-opacity frame paints first (jitter). */
  readonly #expandingMacros = new Set<NodeId>()
  readonly #commentViews = new Map<CommentId, CommentView>()
  readonly #viewport: Viewport
  readonly #interaction: InteractionManager | null
  readonly #zoomBounds: ZoomBounds
  readonly #snapSize: number
  readonly #views = new Map<NodeId, NodeView>()
  /** Per-node render options (category, title, collapsed). Captured at addNode so setTheme can
   *  re-issue the render with identical args after swapping the active theme. */
  readonly #renderOpts = new Map<NodeId, RenderNodeOptions>()
  /** Graph-owned category palette (from `categories` in xenolith.v1) — overrides theme category tokens. */
  #categoryPalette: GraphCategoryPalette | undefined
  /** Reusable live-template definitions, keyed by id. A `$templateInstance` node references one by
   *  `state.definitionId`; its pins mirror the definition's `$templateInput`/`$templateOutput`
   *  boundary nodes. Definitions are document-level — they live on the root, not per dive level. */
  readonly #definitions = new Map<TemplateDefId, TemplateDefinition>()
  /** Palette schemas for the registered template definitions (one per definition), so each shows up
   *  in Tab search and can be inserted as a fresh instance. Kept in sync with #definitions. */
  readonly #templateRegistry = new NodeRegistry()
  /** Saved parent levels while dived into template definitions. Each frame is the state to restore on
   *  dive-out. `#currentDefId` is the definition currently displayed (null at the root document). */
  #diveStack: { graph: Graph; bus: CommandBus; selectionIds: NodeId[]; viewport: ViewportState; defId: TemplateDefId | null }[] = []
  #currentDefId: TemplateDefId | null = null
  #breadcrumbEl: HTMLDivElement | null = null
  #breadcrumbDisabled = false
  /** Measures label/title text so `addNode` can backfill a missing `node.size` from content.
   *  Bound to PIXI's CanvasTextMetrics; falls back to a char-width estimate if that throws (e.g.
   *  a headless environment without a 2D canvas). */
  readonly #textMeasure: TextMeasurer
  readonly #edgeRecords = new Map<EdgeId, EdgeRecord>()
  /** Render opts per edge, kept persistent so undo of a DisconnectEdge can re-materialise the
   *  edge graphics with the same wire colour / type hint it had before. */
  readonly #edgeOpts = new Map<EdgeId, RenderEdgeOptions>()
  /** Edge ids incident to each node (both endpoints), so edge virtualization can materialise only
   *  the wires touching a visible node without scanning every edge. */
  readonly #edgesByNode = new Map<NodeId, EdgeId[]>()
  /** In-memory clipboard buffer set by `copySelection()` and consumed by `paste()`. Stores
   *  references to live node/edge objects + render opts at copy time — survives selection
   *  changes but not editor disposal. We skip JSON serialise/parse on the clipboard path; that
   *  cost showed up clearly in profiling at high node counts. */
  #clipboard: ClipboardSnapshot | null = null
  /** Most recent pointer position in world coords — used by paste-at-cursor and the
   *  ":pointermove" hook. */
  #lastPointerWorld: { x: number; y: number } | null = null
  /** Most recent pointer position in canvas/screen coords — used to open the palette at cursor. */
  #lastPointerScreen: { x: number; y: number } | null = null
  /** Registry of node schemas the insert palette searches. Hosts populate it via `editor.registry`. */
  readonly #registry = new NodeRegistry()
  /** Custom pin-type descriptors (colour/shape/compatibility). Read by connection validation and the
   *  node renderer. Hosts/plugins populate it via `editor.types`. */
  readonly #types = new TypeRegistry()
  readonly #commands = new CommandRegistry()
  #sidebar: SidebarManager | null = null
  #paletteSidebar: PaletteSidebar | null = null
  /** Header glyph icons by name (built-in Feather set + host/plugin-registered). A node's
   *  `glyph.icon` resolves through this. Populated via `editor.icons`. */
  readonly #icons = new IconRegistry()
  /** Built-in schemas always available in the palette, independent of (and unaffected by clearing)
   *  the host registry — currently just the Reroute node. */
  readonly #builtins = new NodeRegistry()
  #palette: InsertPalette | null = null
  /** When the palette was opened via an edge's "Add Node" menu: the edge to splice into plus its
   *  endpoint types (so the palette filters to compatible nodes). Consumed by `#insertFromPalette`. */
  #pendingEdgeSplice: { edgeId: EdgeId; srcType: string; dstType: string } | null = null
  #edgeMenu: EdgeContextMenu | null = null
  #widgetOverlay: WidgetOverlay | null = null
  /** Screen-anchored DOM layer over the WebGL canvas for in-editor chrome (panels, controls,
   *  framework components). The container ignores pointer events; children opt back in. Created
   *  lazily on first `overlayRoot` access so headless/test editors pay nothing. */
  #overlayRoot: HTMLDivElement | null = null
  #controls: EditorControls | null = null
  #minimap: Minimap | null = null
  readonly #widgetControllers = new Map<string, CustomWidgetController>()
  readonly #coreEvents = new EventEmitter<CoreEvents>()
  readonly #events = new EventEmitter<EditorEvents>()
  /** Installed plugins + their disposers. The context factory is lazy so plugins always see the
   *  current display graph/bus. Disposed in `destroy()`. */
  readonly #pluginHost = new PluginHost(() => this.#pluginContext())
  #hoveredId: NodeId | null = null
  readonly #marqueeHovered = new Set<NodeId>()
  #dragState: DragState = { kind: 'idle' }
  #commentDrag:
    | { kind: 'move'; id: CommentId; startScreen: { x: number; y: number }; commentStart: { x: number; y: number }; nodeStarts: Map<NodeId, { x: number; y: number }> }
    | { kind: 'resize'; id: CommentId; startScreen: { x: number; y: number }; sizeStart: { x: number; y: number } }
    | null = null
  #commentLastTap = 0
  #selectedComments = new Set<CommentId>()
  /** Members of every currently-collapsed macro — their node views + internal edges are hidden. */
  #hiddenMembers = new Set<NodeId>()
  #interactive = true
  /** Per-frame tick subscribers (for a host evaluator/simulation). Invoked every frame while the loop
   *  runs, or once per `step()`. The editor itself never reads them — it's not a runtime. */
  readonly #tickListeners = new Set<(dtMs: number) => void>()
  #looping = false
  /** Frame interval (ms) when the host requested an `startLoop({fps})` throttle. 0 = run every
   *  animation frame (default 60 fps). Time since the last fired tick accumulates and only
   *  releases when ≥ `#tickInterval` ms have passed. */
  #tickInterval = 0
  #tickAccum = 0
  #isValidConnection: ((c: ConnectionRequest) => boolean) | undefined
  #statusGfx: Graphics | null = null
  readonly #nodeStatus = new Map<NodeId, NodeStatus>()

  private constructor(app: Application, host: HTMLElement, theme: XenolithTheme, opts: XenolithEditorOptions) {
    this.#app = app
    this.#host = host
    this.#theme = theme
    this.#textMeasure = this.#makeTextMeasure(theme)
    this.#builtins.register(rerouteNodeSchema)
    this.#builtins.register(commentPaletteSchema)
    this.#builtins.register(templateInputSchema)
    this.#builtins.register(templateOutputSchema)
    if (theme.needsBackdrop) {
      this.#backdropRT = this.#createBackdropRT()
    }
    this.#rootGraph = new Graph()
    this.#displayGraph = this.#rootGraph
    this.selection = new Selection()
    this.#rootBus = new CommandBus({ graph: this.#rootGraph, events: this.#coreEvents })
    this.#displayBus = this.#rootBus
    this.#zoomBounds = opts.zoomBounds ?? [0.25, 2]
    this.#snapSize = opts.snap ?? 8

    this.#world = new Container({ label: 'world' })
    this.#edgesLayer = new Container({ label: 'edges' })
    this.#nodesLayer = new Container({ label: 'nodes' })
    if (!opts.disableGrid) {
      this.#gridLayer = this.#createGrid()
      this.#world.addChild(this.#gridLayer)
    }
    // Comment frames are split across two layers so wires read correctly: the translucent BODY sits
    // under the edges (wires between inner nodes draw on top of the tint), while the HEADER bar sits
    // above the edges (the header always reads over any wire crossing the top of the frame).
    this.#commentsLayer = new Container({ label: 'comments' })
    this.#world.addChild(this.#commentsLayer)
    // Expanded-macro frames sit just above comment bodies, below edges — members + their wires draw
    // on top of the frame, same layering as a comment body.
    this.#macroFramesLayer = new Container({ label: 'macro-frames' })
    this.#world.addChild(this.#macroFramesLayer)
    this.#world.addChild(this.#edgesLayer, this.#nodesLayer)
    // Above nodes: an expanded macro's frame + members reparent here so the whole group is on top.
    this.#macroOverlayLayer = new Container({ label: 'macro-overlay' })
    this.#world.addChild(this.#macroOverlayLayer)
    this.#commentHeadersLayer = new Container({ label: 'comment-headers' })
    this.#world.addChildAt(this.#commentHeadersLayer, this.#world.getChildIndex(this.#nodesLayer))
    // LOD batch layer — at far zoom the whole graph is drawn as Graphics batches (nodes + edges) and
    // the live per-node/edge layers are hidden. Sits BELOW #nodesLayer so the sprite-level edge batch
    // renders under the node sprites (above it the wires would paint over the nodes); world-space so
    // pan/zoom ride the transform for free.
    this.#lodLayer = new Container({ label: 'lod' })
    this.#lodLayer.eventMode = 'none'
    this.#lodLayer.visible = false
    this.#world.addChildAt(this.#lodLayer, this.#world.getChildIndex(this.#nodesLayer))
    // Node status rings — world space, ABOVE nodes so they read clearly. Painted in #drawStatuses.
    this.#statusGfx = new Graphics()
    this.#statusGfx.eventMode = 'none'
    this.#world.addChild(this.#statusGfx)
    // Edge midpoint hover ring — drawn just above edges, below nodes, in world space so it tracks
    // pan/zoom. Cleared/repositioned as the cursor enters/leaves a midpoint dot.
    this.#edgeHoverGfx = new Graphics()
    this.#edgeHoverGfx.eventMode = 'none'
    this.#world.addChildAt(this.#edgeHoverGfx, this.#world.getChildIndex(this.#nodesLayer))
    app.stage.addChild(this.#world)

    this.#viewport = new Viewport(this.#world, opts.viewport)

    if (!opts.disableInteraction) {
      this.#interaction = new InteractionManager(app.canvas as HTMLCanvasElement)
      this.#interaction.attach()
      this.#interaction.onZoom(({ focal, factor }) => {
        if (this.#htmlFieldFocused()) return // typing/picking in a DOM overlay — wheel must not zoom
        this.#viewport.zoomAt(focal, factor, this.#zoomBounds)
      })
      this.#interaction.onPan(({ dx, dy }) => {
        if (this.#htmlFieldFocused()) return
        this.#viewport.pan(dx, dy)
      })
      app.stage.eventMode = 'static'
      app.stage.hitArea = app.screen
      // Any pointerdown that reaches the stage means the user is interacting with content, not
      // navigating — drop the navigation freeze at once so the live node (chevron, pins, widgets,
      // drag) responds immediately rather than being stuck behind a frozen sprite for ~130ms.
      app.stage.on('pointerdown', () => { if (this.#frozen) this.#endFreeze() })
      this.#wireStageInteraction()
      window.addEventListener('keydown', this.#onKeyDown)
      ;(app.canvas as HTMLCanvasElement).addEventListener('dblclick', this.#onDoubleClick)
      // Suppress the browser context menu — `#onContextMenu` only preventDefaults; the actual menu
      // OPEN fires on pointerup (after a non-drag right click) so dragging the canvas with the
      // right button doesn't flash the menu mid-pan.
      ;(app.canvas as HTMLCanvasElement).addEventListener('contextmenu', this.#onContextMenu)
      ;(app.canvas as HTMLCanvasElement).addEventListener('pointerdown', this.#onRightDown)
      ;(app.canvas as HTMLCanvasElement).addEventListener('pointerup',   this.#onRightUp)
      // G13 — HTML5 file/text DnD onto the canvas. preventDefault on dragover is required for
      // drop to fire; on drop we hit-test the world point against nodes and emit `node:drop`.
      ;(app.canvas as HTMLCanvasElement).addEventListener('dragover', this.#onDragOver)
      ;(app.canvas as HTMLCanvasElement).addEventListener('drop',     this.#onDrop)
    } else {
      this.#interaction = null
    }

    this.selection.on((e) => {
      this.#updateVisualStates(); this.#requestRender()
      this.#events.emit('selection:changed', { nodeIds: e.ids })
    })
    this.#viewport.on((vp) => { this.#onViewportChanged(); this.#events.emit('viewport:changed', { x: vp.x, y: vp.y, zoom: vp.zoom }) })

    // Bridge command-bus lifecycle → public graph-mutation events (covers programmatic API, palette,
    // paste, drag-commit, and undo/redo through one choke point).
    createGraphEventBridge({
      coreEvents: this.#coreEvents,
      graph: () => this.#displayGraph,
      bus: this.#events,
      canUndo: () => this.commandBus.canUndo(),
      canRedo: () => this.commandBus.canRedo(),
    })

    // View-sync: after every command apply/undo/redo, reconcile views with the graph model so
    // undo of a Move/Connect/Remove visually reverts the canvas. We defer the reconcile to a
    // microtask so a transaction that fires N command:applied events collapses to one O(N) sync
    // instead of N × O(N+E) = O(N²) — critical for paste/duplicate at high node counts.
    const scheduleSync = (): void => { this.#scheduleSync(); this.#requestRender() }
    // Drop the macro parent-index whenever the graph topology MIGHT have changed (add/remove node,
    // SetNodeState that touched state.members). Cheaper to flag-and-rebuild on next read than to
    // mutate the index in lockstep with every command.
    const invalidateMacroIndex = ({ command }: { command: { type: string } }): void => {
      const t = command.type
      if (t === 'AddNode' || t === 'RemoveNode' || t === 'SetNodeState' || t === 'SetNodeWidgets') {
        this.#invalidateMacroIndex()
      }
    }
    this.#coreEvents.on('command:applied', invalidateMacroIndex)
    this.#coreEvents.on('command:undone',  invalidateMacroIndex)
    this.#coreEvents.on('command:redone',  invalidateMacroIndex)
    this.#coreEvents.on('command:applied', scheduleSync)
    this.#coreEvents.on('command:undone',  scheduleSync)
    this.#coreEvents.on('command:redone',  scheduleSync)

    // Repaint endpoint nodes when an edge attaches/detaches so the exec-pin "outlined when free /
    // filled gold when wired" signal stays live. Cheap: only the two endpoint nodes are touched.
    // A node with pin-bound widgets needs RESIZE (its row heights change with widget visibility)
    // — bare repaint would draw the new widget visibility into a stale size box.
    const repaintEndpoint = (id: NodeId): void => {
      if (!this.#views.has(id)) return
      const n = this.graph.getNode(id)
      // Resize (rebuilds size + view) when ANY widget binds to a pin — explicit `pinKey` OR
      // implicit via `key`. A `whenDisconnected` widget needs the node to shrink/grow on
      // connect/disconnect; `widgetBindKey()` is the same predicate computeWidgetRects uses.
      const hasBoundWidget = !!n?.widgets?.some((w) => widgetBindKey(w) !== undefined)
      if (hasBoundWidget) this.#resizeNodeView(id); else this.#rerenderNode(id)
    }
    const repaintEndpoints = (from: NodeId, to: NodeId): void => {
      repaintEndpoint(from)
      if (to !== from) repaintEndpoint(to)
      this.#requestRender()
    }
    this.#events.on('edge:connected',    ({ edge })   => {
      // `#edgesByNode` is rebuilt in a microtask via `#scheduleSync`, but this listener runs
      // SYNCHRONOUSLY right after the command — before that microtask. Without an up-front index
      // update, `#connectedPinIdsFor` (called by the renderer in `repaintEndpoints` below) would
      // see stale state and a pin-bound widget wouldn't hide on connect.
      this.#addEdgeToIndex(edge as Edge)
      repaintEndpoints(edge.from.node, edge.to.node)
    })
    this.#events.on('edge:disconnected', ({ edgeId }) => {
      // By the time this fires the edge is already gone from the graph, so look up endpoints
      // through the per-node index (which lags removal but still remembers the stale edgeId).
      const touched: NodeId[] = []
      for (const [nid, eids] of this.#edgesByNode) if (eids.includes(edgeId as EdgeId)) touched.push(nid)
      // Drop the dead edge id from the index NOW so the resize+repaint below sees it gone.
      for (const nid of touched) {
        const arr = this.#edgesByNode.get(nid)
        if (arr) {
          const filtered = arr.filter((e) => e !== edgeId)
          if (filtered.length === 0) this.#edgesByNode.delete(nid); else this.#edgesByNode.set(nid, filtered)
        }
      }
      if (touched.length === 2) repaintEndpoints(touched[0]!, touched[1]!)
      else if (touched.length === 1) repaintEndpoints(touched[0]!, touched[0]!)
    })

    // Render-on-demand: drop PIXI's unconditional per-frame render and drive it ourselves only
    // when the scene is dirty. On a static graph the ticker callback does a single boolean check
    // and returns — no edge redraw, no backdrop RT pass, no shader work, no GPU submit.
    app.ticker.remove(app.render, app)
    app.ticker.add(() => {
      // Drive the host loop first: a sim tick may mutate the graph (via the command bus), which sets
      // #needsRender below, so the frame it produces paints in the same pass. Cheap no-op when idle.
      if (this.#looping && this.#tickListeners.size > 0) {
        const dt = this.#app.ticker.deltaMS
        if (this.#tickInterval <= 0) {
          this.#emitTick(dt)
        } else {
          // Throttled tick — accumulate real frame time, fire onTick once per interval boundary.
          this.#tickAccum += dt
          if (this.#tickAccum >= this.#tickInterval) {
            this.#emitTick(this.#tickAccum)
            this.#tickAccum = 0
          }
        }
      }
      if (this.#statsVisible) this.#tickStats()
      // Keep animated edges flowing: bump the dash phase and mark dirty each frame, but only while
      // at least one animated edge exists — otherwise the graph stays render-on-demand idle.
      if (this.#animatedEdges.size > 0 && !this.#frozen) { this.#dashPhase += 1.6; this.#needsRender = true }
      if (!this.#needsRender) return
      this.#needsRender = false
      // Coalesce viewport-driven culling to one pass per frame: a fast wheel-zoom fires many
      // viewport:changed events, and culling on each would thrash create/destroy. Doing it here
      // throttles it to the frame rate.
      if (this.#cullPending) { this.#cullPending = false; this.#cullToViewport() }
      // While frozen (mid zoom/pan) the live nodes are hidden behind baked sprites that ride the
      // world transform — skip edge redraw, the backdrop RT and the glass shader entirely. Same in
      // LOD: the live node/edge layers are hidden behind the flat batch, so the backdrop RT and a
      // backdrop-sampling theme's per-frame shader (Liquid Glass) are pure wasted work.
      if (!this.#frozen && this.#lodLevel === 'full') {
        for (const edgeId of this.#edgeRecords.keys()) this.#redrawEdge(edgeId)
        this.#updateBackdrop()
        this.#theme.onFrame?.(this.#themeContext())
        this.#drawStatuses()
      }
      // Ticker may fire after destroy() — PIXI's `app.screen` getter THROWS on a destroyed
      // Application (not null-return), so gate on the explicit flag.
      if (this.#destroyed) return
      const screen = this.#app.screen
      this.#minimap?.setViewport(this.#viewport.state, screen.width, screen.height)
      // Tolerate transient PIXI v8 filter races (BindGroup.setResource null in _applyFiltersToTexture
      // when a bake-glow cache miss collides with a re-render). Logging > killing the ticker —
      // the next frame is almost always fine.
      try { this.#app.render() } catch (err) { console.warn('[editor] PIXI render frame failed (continuing)', err) }
      this.#positionDomWidgets()
    })

    if (opts.minimap) {
      this.#ensureMinimap()
      if (typeof opts.minimap === 'object' && opts.minimap.position) this.#minimap!.setPosition(opts.minimap.position)
    }

    if (opts.resizeToWindow !== false) {
      window.addEventListener('resize', this.#onResize)
    } else if (typeof ResizeObserver !== 'undefined') {
      // Embedded mode: fit the host element (panels, framework islands) instead of the window.
      const fit = (): void => {
        const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight)
        this.#app.renderer.resize(w, h)
        this.#onResize()
      }
      fit()
      this.#hostResizeObserver = new ResizeObserver(fit)
      this.#hostResizeObserver.observe(host)
    }

    this.#applyThemeVars()
    this.#isValidConnection = opts.isValidConnection
    if (opts.controls) this.setControls(typeof opts.controls === 'object' ? opts.controls : {})
    this.#updateGrid() // size the infinite grid to the initial viewport
  }

  #hostResizeObserver: ResizeObserver | null = null

  /** Show/configure/hide the built-in viewport controls. Pass options to create or reconfigure,
   *  `false` to remove. The widget is vanilla DOM in `overlayRoot`, so every framework shares it. */
  setControls(opts: ControlsOptions | false): void {
    if (opts === false) { this.#controls?.destroy(); this.#controls = null; return }
    void this.overlayRoot // ensure the overlay layer exists
    if (this.#controls) this.#controls.setOptions(opts)
    else this.#controls = new EditorControls(this, opts)
  }

  /** Write the active theme's panel/control `--xeno-*` custom properties onto the host so in-editor
   *  chrome (panels, controls, framework components portalled into `overlayRoot`) and DOM widgets
   *  inherit them and restyle on `setTheme`. */
  #applyThemeVars(): void {
    for (const [k, v] of Object.entries(themeCssVars(this.#theme.tokens))) {
      this.#host.style.setProperty(k, v)
    }
  }

  /** Screen-anchored DOM overlay over the canvas. Framework adapters portal in-editor panels and
   *  controls here; the container ignores pointer events so the canvas stays interactive, and each
   *  panel opts back in (`pointer-events: auto`). Inherits the theme's `--xeno-*` vars from the host. */
  get overlayRoot(): HTMLElement {
    if (!this.#overlayRoot) {
      if (getComputedStyle(this.#host).position === 'static') this.#host.style.position = 'relative'
      const root = document.createElement('div')
      root.setAttribute('data-xeno-overlay-root', '')
      // zIndex above the DOM-widget layer (5) so chrome — panels, controls, minimap — always sits
      // on top of in-node DOM widgets (e.g. a large image-preview widget must never cover a panel).
      Object.assign(root.style, {
        position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden', zIndex: '10',
      } as Partial<CSSStyleDeclaration>)
      this.#host.appendChild(root)
      this.#overlayRoot = root
    }
    return this.#overlayRoot
  }

  /** Mark the scene dirty so the next ticker frame repaints. Cheap to call repeatedly — the flag
   *  collapses many calls in one frame into a single render. */
  #requestRender = (): void => { this.#needsRender = true }
  #resizeScheduled = false
  readonly #onResize = (): void => {
    // PIXI's `resizeTo: window` resizes the renderer on its OWN rAF, so the `resize` event fires
    // BEFORE `this.#app.screen` updates. Defer a frame (coalesced) so chrome reads fresh dims —
    // otherwise the minimap/grid keep the pre-resize layout (e.g. after closing devtools).
    if (this.#resizeScheduled) return
    this.#resizeScheduled = true
    requestAnimationFrame(() => {
      this.#resizeScheduled = false
      // Editor may have been destroyed between scheduling and the frame firing (React unmount,
      // HMR, etc.). PIXI's `app.screen` getter throws on a destroyed Application — gate on flag.
      if (this.#destroyed) return
      const screen = this.#app.screen
      this.#minimap?.place(screen.width, screen.height)
      this.#minimap?.setViewport(this.#viewport.state, screen.width, screen.height)
      this.#updateGrid()
      this.#positionDomWidgets()
      this.#requestRender()
    })
  }

  #minimapSyncScheduled = false
  /** Coalesce many node mutations (e.g. a 1391-node loadJSON calling addNode per node) into one
   *  minimap rebuild on the next microtask. */
  #scheduleMinimapSync(): void {
    if (this.#minimapSyncScheduled || !this.#minimap) return
    this.#minimapSyncScheduled = true
    queueMicrotask(() => { this.#minimapSyncScheduled = false; this.#syncMinimap() })
  }

  /** Feed the minimap the current node rects (world space). */
  #syncMinimap(): void {
    if (!this.#minimap) return
    const nodes: { x: number; y: number; width: number; height: number }[] = []
    for (const n of this.graph.nodes()) {
      const size = n.size ?? { x: this.#theme.tokens.geometry.node.minWidth, y: 40 }
      nodes.push({ x: n.position.x, y: n.position.y, width: size.x, height: size.y })
    }
    this.#minimap.setData(nodes)
  }

  /** Create the WebGL minimap and wire its recenter-on-click; idempotent. Lets `setMinimapVisible`
   *  (and the declarative `<XenolithMiniMap>`) enable a minimap that wasn't requested at init. */
  #ensureMinimap(): Minimap {
    if (this.#minimap) return this.#minimap
    const mm = new Minimap(this.#theme.tokens)
    mm.onRecenter = (wx, wy) => {
      const vp = this.#viewport.state
      this.#viewport.setState({
        zoom: vp.zoom,
        x: this.#app.screen.width / 2 - wx * vp.zoom,
        y: this.#app.screen.height / 2 - wy * vp.zoom,
      })
    }
    this.#app.stage.addChild(mm.container)
    mm.place(this.#app.screen.width, this.#app.screen.height)
    this.#minimap = mm
    this.#syncMinimap()
    return mm
  }

  /** Show / hide the overview minimap. Creates it lazily the first time it's shown. */
  setMinimapVisible(visible: boolean): void {
    if (visible) this.#ensureMinimap()
    this.#minimap?.setVisible(visible)
    this.#requestRender()
  }
  /** Move the minimap to a standard anchor (8 directions) or exact screen coordinates. */
  setMinimapPosition(position: MinimapPosition): void { this.#minimap?.setPosition(position); this.#requestRender() }

  #frozen = false
  #freezeTimer: ReturnType<typeof setTimeout> | null = null
  #freezeRT: RenderTexture | null = null
  #frozenSprites: Sprite[] = []
  #captureVp: ViewportState | null = null

  /** Viewport changed (zoom/pan). For themes that opt in (`freezeOnNavigate`, e.g. Liquid Glass) we
   *  BAKE each node into a sprite at gesture start (its current pixels — background/refraction
   *  included), hide the live node, and let the baked sprites ride the world transform. Grid + edges
   *  stay live. When the view pans/zooms beyond what was captured we re-bake (else new area shows
   *  empty). A 130ms idle debounce restores the live nodes. Cheap themes (Xen) just repaint. (The
   *  per-node bake is also the basis for LOD: freeze off-screen / far-zoom nodes the same way.) */
  #onViewportChanged(): void {
    this.#updateGrid()
    if (!this.#theme.freezeOnNavigate) { this.#cullPending = true; this.#requestRender(); return }
    if (this.#frozen && this.#captureStale()) this.#endFreeze()
    if (!this.#frozen) this.#beginFreeze()
    this.#requestRender()
    if (this.#freezeTimer) clearTimeout(this.#freezeTimer)
    this.#freezeTimer = setTimeout(() => this.#endFreeze(), 130)
  }

  /** True when the live view has moved/zoomed beyond the baked sprites — time to re-capture so the
   *  newly-revealed area isn't blank and zoomed-in nodes stay crisp. */
  #captureStale(): boolean {
    const c = this.#captureVp
    if (!c) return true
    const v = this.#viewport.state
    if (v.zoom < c.zoom * 0.97 || v.zoom > c.zoom * 1.6) return true
    const sw = Math.max(1, this.#app.screen.width)
    const sh = Math.max(1, this.#app.screen.height)
    return Math.abs(v.x - c.x) > sw * 0.3 || Math.abs(v.y - c.y) > sh * 0.3
  }

  #beginFreeze(): void {
    const vp = this.#viewport.state
    const res = this.#app.renderer.resolution
    const sw = Math.max(1, this.#app.screen.width)
    const sh = Math.max(1, this.#app.screen.height)
    // Refresh the backdrop so the captured glass refraction is current, then snapshot the screen —
    // each node sprite is a sub-region of it, so we don't re-run the glass shader per node.
    this.#updateBackdrop()
    if (this.#freezeRT) this.#freezeRT.destroy(true)
    this.#freezeRT = RenderTexture.create({ width: sw, height: sh, resolution: res })
    this.#app.renderer.render({ container: this.#app.stage, target: this.#freezeRT })
    this.#captureVp = vp

    for (const [id, view] of this.#views) {
      const node = this.graph.getNode(id)
      if (!node?.size) continue
      const sx = node.position.x * vp.zoom + vp.x
      const sy = node.position.y * vp.zoom + vp.y
      const sWid = node.size.x * vp.zoom
      const sHei = node.size.y * vp.zoom
      // Skip nodes fully off-screen — nothing to bake.
      if (sx + sWid < 0 || sy + sHei < 0 || sx > sw || sy > sh) continue
      const frame = new Rectangle(
        Math.max(0, sx), Math.max(0, sy),
        Math.min(sWid, sw - Math.max(0, sx)), Math.min(sHei, sh - Math.max(0, sy)),
      )
      if (frame.width <= 0 || frame.height <= 0) continue
      const tex = new Texture({ source: this.#freezeRT.source, frame })
      const sprite = new Sprite(tex)
      sprite.eventMode = 'none'
      // Place back in world space at the (clipped) node rect; the world transform makes it track.
      sprite.position.set((frame.x - vp.x) / vp.zoom, (frame.y - vp.y) / vp.zoom)
      sprite.width = frame.width / vp.zoom
      sprite.height = frame.height / vp.zoom
      this.#nodesLayer.addChild(sprite)
      this.#frozenSprites.push(sprite)
      view.container.visible = false
    }
    this.#frozen = true
  }

  #endFreeze(): void {
    for (const s of this.#frozenSprites) { this.#nodesLayer.removeChild(s); s.destroy() }
    this.#frozenSprites = []
    this.#freezeRT?.destroy(true)
    this.#freezeRT = null
    for (const view of this.#views.values()) view.container.visible = true
    this.#frozen = false
    // Restoring visible=true blindly re-exposed collapsed-macro members. Re-apply macro rules so
    // hidden members go back to hidden.
    this.#applyMacroVisibility()
    this.#requestRender()
  }

  // ─── Viewport virtualization (#59) ────────────────────────────────────────────────────────────
  // Past the threshold (theme.virtualizeThreshold, default 300) only nodes near the viewport keep a
  // live PIXI view; off-screen nodes are data only (0 GPU). Hysteresis (inner create-band / outer
  // keep-band) stops create/destroy churn — and the resulting flicker — during a pan. At or below
  // the threshold this is fully inert: every node renders 1:1, exactly as before.
  #virtualizeInnerMargin = 256
  #virtualizeOuterMargin = 768
  #cullPending = false
  // Three-tier LOD: 'full' real nodes (close), 'sprite' one baked texture per node TYPE (mid —
  // recognisable + cheap, and crucially no LG per-node backdrop RTs), 'flat' a single batch of rects
  // (far). Boundaries carry hysteresis so a hovering zoom doesn't thrash. See lodLevel().
  #lodLevel: LODLevel = 'full'
  #lodThresholds: LODThresholds = { lowEnter: 0.18, lowExit: 0.24, highEnter: 0.42, highExit: 0.52 }
  /** Baked node textures, shared by signature (type + collapsed + category + size) — a handful of
   *  textures cover the whole graph since the node type-set is small. */
  readonly #bakeCache = new Map<string, Texture>()
  // Spatial grid: buckets node ids by world cell so culling queries only nodes near the viewport
  // instead of scanning the whole graph each frame — the O(N)-per-frame trap at 100k+ nodes.
  readonly #spatialCell = 1024
  readonly #spatialGrid = new Map<string, NodeId[]>()
  #spatialMaxW = 0
  #spatialMaxH = 0

  #virtualizeActive(): boolean {
    return shouldVirtualize(this.graph.nodeCount, this.#theme.virtualizeThreshold ?? 300)
  }

  /** True while `id` is being live-dragged (node drag or comment-group move) — its view sits at the
   *  cursor offset, ahead of the not-yet-committed `node.position`. */
  #isLiveDraggingNode(id: NodeId): boolean {
    if (this.#dragState.kind === 'active' && this.#dragState.initialPositions.has(id)) return true
    if (this.#commentDrag?.kind === 'move' && this.#commentDrag.nodeStarts.has(id)) return true
    return false
  }

  /** Materialise a node's view if it has none; otherwise just refresh its position. */
  #ensureView(node: Node): NodeView {
    const existing = this.#views.get(node.id)
    if (existing) {
      // Don't yank a node that's mid-drag back to its committed position — a sync firing during the
      // drag (e.g. a per-tick widget write while animating) would otherwise make it jitter/teleport.
      if (!this.#isLiveDraggingNode(node.id)) existing.container.position.set(node.position.x, node.position.y)
      return existing
    }
    const opts = this.#renderOpts.get(node.id) ?? {}
    this.#ensureSize(node, opts)
    const view = this.#renderNode(node, opts)
    this.#views.set(node.id, view)
    this.#nodesLayer.addChild(view.container)
    this.#wireNodeInteraction(node.id, view)
    view.container.position.set(node.position.x, node.position.y)
    return view
  }

  /** Destroy a view because the node scrolled off-screen. The node stays as data, so — unlike a
   *  node removed from the graph — we must NOT clear its status or drop it from the selection. */
  #destroyViewOffscreen(id: NodeId): void {
    const view = this.#views.get(id)
    if (!view) return
    view.container.destroy({ children: true })
    this.#views.delete(id)
    this.#marqueeHovered.delete(id)
    if (this.#hoveredId === id) this.#hoveredId = null
  }

  /** Insert one node into the spatial grid (by its top-left cell) and grow the tracked max size. */
  #addToSpatialGrid(node: Node): void {
    const key = cellKey(node.position.x, node.position.y, this.#spatialCell)
    const bucket = this.#spatialGrid.get(key)
    if (bucket) bucket.push(node.id); else this.#spatialGrid.set(key, [node.id])
    if (node.size) {
      if (node.size.x > this.#spatialMaxW) this.#spatialMaxW = node.size.x
      if (node.size.y > this.#spatialMaxH) this.#spatialMaxH = node.size.y
    }
  }

  /** Rebuild the whole grid from the current graph — cheap O(N), run only on graph edits (sync),
   *  not per frame. Keeps buckets free of moved/removed ids. */
  #rebuildSpatialGrid(): void {
    this.#spatialGrid.clear()
    this.#spatialMaxW = 0
    this.#spatialMaxH = 0
    for (const n of this.graph.nodes()) this.#addToSpatialGrid(n as Node)
  }

  /** Node ids whose bounds intersect `rect`, gathered from the grid cells the rect overlaps (padded
   *  by the largest node so a node whose top-left sits just outside the rect is still caught). */
  #nodesInRect(rect: GeomRect): NodeId[] {
    const padded: GeomRect = {
      x: rect.x - this.#spatialMaxW,
      y: rect.y - this.#spatialMaxH,
      width: rect.width + this.#spatialMaxW,
      height: rect.height + this.#spatialMaxH,
    }
    const out: NodeId[] = []
    for (const key of cellsForRect(padded, this.#spatialCell)) {
      const bucket = this.#spatialGrid.get(key)
      if (!bucket) continue
      for (const id of bucket) {
        const n = this.graph.getNode(id)
        if (n && rectIntersects(nodeBounds(n as Node, this.#theme.tokens), rect)) out.push(id)
      }
    }
    return out
  }

  #addEdgeToIndex(edge: Edge): void {
    for (const nodeId of [edge.from.node, edge.to.node]) {
      const bucket = this.#edgesByNode.get(nodeId)
      if (bucket) bucket.push(edge.id); else this.#edgesByNode.set(nodeId, [edge.id])
    }
  }

  #rebuildEdgeIndex(): void {
    this.#edgesByNode.clear()
    for (const e of this.graph.edges()) this.#addEdgeToIndex(e as Edge)
  }

  /** Add an edge as DATA only (model + opts + index), no Graphics — the virtualized loadJSON path.
   *  #cullEdges materialises the visible ones later. */
  #addEdgeData(edge: Edge, opts: RenderEdgeOptions): void {
    this.graph._addEdge(edge)
    this.#edgeOpts.set(edge.id, opts)
    this.#addEdgeToIndex(edge)
  }

  /** Materialise only edges incident to a currently-live node; dispose the rest. Keeps the edge
   *  Graphics count O(visible) — without this, app.render walks every wire in the graph each frame
   *  (the real lag on large connected graphs). Only meaningful at the full LOD level. */
  #cullEdges(): void {
    const desired = new Set<EdgeId>()
    for (const nodeId of this.#views.keys()) {
      const inc = this.#edgesByNode.get(nodeId)
      if (inc) for (const eid of inc) desired.add(eid)
    }
    for (const eid of desired) {
      if (!this.#edgeRecords.has(eid)) {
        const edge = this.graph.getEdge(eid)
        if (edge) this.#materializeEdge(edge as Edge, this.#edgeOpts.get(eid) ?? {})
      }
    }
    for (const eid of [...this.#edgeRecords.keys()]) {
      if (!desired.has(eid)) this.#disposeEdgeGraphics(eid)
    }
  }

  /** World-space inner (create) and outer (keep) overscan rects for the current viewport. */
  #virtualizeBands(): { inner: GeomRect; outer: GeomRect } {
    const vp = this.#viewport.state
    const sw = Math.max(1, this.#app.screen.width)
    const sh = Math.max(1, this.#app.screen.height)
    return {
      inner: visibleWorldRect(sw, sh, vp, this.#virtualizeInnerMargin),
      outer: visibleWorldRect(sw, sh, vp, this.#virtualizeOuterMargin),
    }
  }

  /** Reconcile live views with the viewport (pan/zoom path) across the three LOD levels. */
  #cullToViewport(): void {
    if (!this.#virtualizeActive()) return
    // Comments virtualize on the same pan/zoom pass as nodes (thousands off-screen otherwise).
    if (this.graph.commentCount > 0) this.#syncComments()
    const level = lodLevel(this.#viewport.state.zoom, this.#lodLevel, this.#lodThresholds)
    if (level !== this.#lodLevel) this.#applyLODLevel(level)
    // 'flat' draws the whole graph as static batch Graphics in world space — pan/zoom ride the
    // transform for free, nothing to reconcile.
    if (this.#lodLevel === 'flat') { this.#requestRender(); return }
    // 'full' and 'sprite' both virtualize per node; #ensureView builds the right kind of view.
    // The spatial grid keeps this O(visible): only nodes in the viewport's cells are examined, never
    // the whole graph. Hysteresis — create in the inner band, destroy past the outer band.
    const { inner, outer } = this.#virtualizeBands()
    const outerIds = new Set<string>(this.#nodesInRect(outer).map(String))
    let changed = false
    for (const id of this.#nodesInRect(inner)) {
      if (!this.#views.has(id)) { const n = this.graph.getNode(id); if (n) { this.#ensureView(n as Node); changed = true } }
    }
    for (const id of [...this.#views.keys()]) {
      if (!outerIds.has(String(id))) { this.#destroyViewOffscreen(id); changed = true }
    }
    if (!changed) return
    if (this.#lodLevel === 'full') this.#cullEdges() // wires follow the live nodes
    // A freshly-materialised view starts with visible=true, but if it's a member of a collapsed
    // macro it must stay hidden. Without this, paste-then-pan reveals "dissolved" members the
    // moment they re-enter the viewport — exactly the regression image #23 was showing.
    this.#applyMacroVisibility()
    this.#updateVisualStates()
    // NOT #scheduleMinimapSync(): culling only changes which views are live, not the graph data the
    // minimap draws (node positions are unchanged). Rebuilding it here meant an O(N) minimap repaint
    // every pan frame — the real lag at 100k+. The minimap's viewport frame still updates each tick.
    this.#requestRender()
  }

  /** Switch detail level: wipe live views (full↔sprite swaps the view kind; flat has none), toggle
   *  the layers, and (re)build the batch Graphics the new level needs. One-off cost per crossing. */
  #applyLODLevel(level: LODLevel): void {
    this.#lodLevel = level
    // Comments collapse to a plain rectangle at any non-full LOD (no per-frame gradient/title cost).
    const simpleComments = level !== 'full'
    for (const v of this.#commentViews.values()) v.setSimplified(simpleComments)
    for (const id of [...this.#views.keys()]) this.#destroyViewOffscreen(id)
    this.#lodLayer.removeChildren().forEach((c) => c.destroy())
    // Leaving full: the per-edge Graphics are replaced by the LOD line batch, so free them.
    if (level !== 'full') for (const id of [...this.#edgeRecords.keys()]) this.#disposeEdgeGraphics(id)
    if (level === 'full') {
      this.#nodesLayer.visible = true
      this.#edgesLayer.visible = true
      this.#lodLayer.visible = false
    } else if (level === 'sprite') {
      // Real edges hidden; draw them as the cheap line batch. Nodes become baked sprites (built lazily
      // by #cullToViewport via #ensureView), so the live node layer stays visible to host them.
      this.#nodesLayer.visible = true
      this.#edgesLayer.visible = false
      this.#lodLayer.addChild(this.#buildLODEdges())
      this.#lodLayer.visible = true
    } else {
      this.#nodesLayer.visible = false
      this.#edgesLayer.visible = false
      this.#lodLayer.addChild(this.#buildLODEdges(), this.#buildLODNodes())
      this.#lodLayer.visible = true
    }
  }

  /** Faint thin straight lines centre-to-centre for every edge, in one Graphics. The real bezier
   *  routing is invisible at this zoom and a per-edge Graphics each is what makes the wire-web crawl. */
  #buildLODEdges(): Graphics {
    const edges = new Graphics()
    const hidden = this.#hiddenMembers
    for (const e of this.graph.edges()) {
      if (hidden.has(e.from.node) || hidden.has(e.to.node)) continue
      const a = this.graph.getNode(e.from.node), b = this.graph.getNode(e.to.node)
      if (!a || !b) continue
      const aw = a.size?.x ?? 0, ah = a.size?.y ?? 0, bw = b.size?.x ?? 0, bh = b.size?.y ?? 0
      edges.moveTo(a.position.x + aw / 2, a.position.y + ah / 2)
      edges.lineTo(b.position.x + bw / 2, b.position.y + bh / 2)
    }
    edges.stroke({ color: 0x8a93a6, width: 2, alpha: 0.18 })
    return edges
  }

  /** One rounded rect per node, category colour at reduced brightness, all in one Graphics → a single
   *  draw call for the whole graph at far zoom. */
  #buildLODNodes(): Graphics {
    const tokens = this.#theme.tokens
    const radius = tokens.geometry.node.radius
    const nodes = new Graphics()
    const hidden = this.#hiddenMembers
    for (const n of this.graph.nodes()) {
      if (hidden.has(n.id)) continue
      const w = n.size?.x ?? tokens.geometry.node.minWidth
      const h = n.size?.y ?? tokens.geometry.node.headerHeight
      const ro = this.#renderOpts.get(n.id)
      const cat = resolveCategoryGradient(ro?.category, tokens, this.#categoryPalette, ro?.color)
      nodes.roundRect(n.position.x, n.position.y, w, h, radius).fill({ color: darkenColor(cat.start, 0.55) })
    }
    return nodes
  }

  /** Bake a node's default appearance (empty state — widgets at defaults) to a shared texture keyed
   *  by type/collapsed/category/size. Uses the base Xen renderNode (not theme.renderNode) so the LG
   *  glass shader — and its per-node backdrop RTs — are skipped entirely: the sprite is flat pixels. */
  #bakeNodeTexture(node: Node): Texture {
    const opts = this.#renderOpts.get(node.id) ?? {}
    const tokens = this.#theme.tokens
    const w = Math.max(1, Math.ceil(node.size?.x ?? tokens.geometry.node.minWidth))
    const h = Math.max(1, Math.ceil(node.size?.y ?? tokens.geometry.node.headerHeight))
    // Colour-affecting fields go in the cache key: a per-node colour or a palette entry for the
    // category changes the baked pixels, so two same-type nodes can't share a sprite blindly.
    const palette = this.#categoryPalette
    const catColour = opts.color ?? (opts.category && palette ? JSON.stringify(palette[opts.category]) : '')
    const sig = `${node.type}|${opts.collapsed ? 'c' : 'e'}|${opts.category ?? ''}|${catColour}|${w}x${h}`
    const cached = this.#bakeCache.get(sig)
    if (cached) return cached
    const blank: Node = { ...node, state: {} }
    const view = renderNode(blank, tokens, { ...opts, ...(palette ? { categoryPalette: palette } : {}), renderer: this.#app.renderer as never, customWidgets: this.#widgetControllers })
    // generateTexture() bakes the container correctly even when called repeatedly mid-frame — a raw
    // renderer.render(target) loop only filled the first texture and left the rest blank.
    const tex = this.#app.renderer.generateTexture({ target: view.container, frame: new Rectangle(0, 0, w, h) })
    view.container.destroy({ children: true })
    this.#bakeCache.set(sig, tex)
    return tex
  }

  /** Sprite-LOD view: a single baked-texture sprite. Edges are drawn by the line batch, so
   *  pinLocalPosition isn't needed for wires here (returns null). */
  #spriteViewFor(node: Node): NodeView {
    const container = new Container({ label: `node:${node.id}` })
    container.position.set(node.position.x, node.position.y)
    container.addChild(new Sprite(this.#bakeNodeTexture(node)))
    return {
      container,
      setVisualState: () => {},
      setCollapsed: () => {},
      isCollapsed: () => false,
      pinLocalPosition: () => null,
    }
  }


  /** Double-click on empty canvas opens the insert palette at the cursor. Skipped when the
   *  cursor is over a node (so double-clicking a node body never spawns a palette on top of it). */
  readonly #onDoubleClick = (e: MouseEvent): void => {
    if (this.#hoveredId !== null) {
      const n = this.graph.getNode(this.#hoveredId)
      // Double-clicking a macro toggles it (collapsed ⇄ expanded); a template instance dives into
      // its shared definition.
      if (n && isMacro(n)) this.toggleMacro(this.#hoveredId)
      else if (n && isTemplateInstance(n)) this.diveInto(this.#hoveredId)
      return
    }
    this.openPalette({ x: e.offsetX, y: e.offsetY })
  }

  /** Right-click on (or near) an edge opens its context menu — Add Reroute / Add Node. Right-click
   *  on empty canvas is ignored (lets the browser menu through is undesirable on a canvas, so we
   *  simply suppress and do nothing). */
  // Tracks a right-button press so we can fire the context menu on RELEASE (mouseup) only when
  // the pointer didn't move — right-mouse-drag is the pan gesture and must NOT pop the menu.
  #rightDownAt: { x: number; y: number } | null = null
  readonly #onRightDown = (e: PointerEvent): void => {
    if (e.button !== 2) return
    this.#rightDownAt = { x: e.clientX, y: e.clientY }
  }
  readonly #onRightUp = (e: PointerEvent): void => {
    if (e.button !== 2 || !this.#rightDownAt) return
    const dx = e.clientX - this.#rightDownAt.x
    const dy = e.clientY - this.#rightDownAt.y
    this.#rightDownAt = null
    // Movement threshold — pan, not a click. Tuned so a tiny accidental jitter (≤4px) still
    // counts as a click; deliberate drag suppresses the menu.
    if (Math.hypot(dx, dy) > 4) return
    this.#openMenuAt({ x: e.offsetX, y: e.offsetY })
  }

  /** HTML5 DnD — dragover MUST preventDefault to mark the area as a drop target. */
  readonly #onDragOver = (e: DragEvent): void => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }
  /** Translate a file/text drop into a `node:drop` event with the world-space drop position and
   *  the node it landed on (if any). Hosts wire image uploaders, JSON loaders, etc. through this. */
  readonly #onDrop = (e: DragEvent): void => {
    e.preventDefault()
    const dt = e.dataTransfer
    if (!dt) return
    const screen = { x: e.offsetX, y: e.offsetY }
    const world = screenToWorld(screen, this.#viewport.state)
    const nodeId = this.#pickNodeAt(world)
    const files = Array.from(dt.files ?? [])
    const items: Record<string, string> = {}
    for (const t of dt.types) {
      // Skip the synthetic "Files" entry (it isn't a string payload — files are surfaced via `files`).
      if (t === 'Files') continue
      const data = dt.getData(t)
      if (data) items[t] = data
    }
    const text = items['text/plain'] ?? null
    this.#events.emit('node:drop', { nodeId, files, text, items, position: world })
  }

  /** Pick the deepest interactive target under `screen` (pin → node → edge midpoint) and open the
   *  matching context menu. Called from `#onRightUp` after confirming the gesture wasn't a pan. */
  #openMenuAt(screen: { x: number; y: number }): void {
    const world = screenToWorld(screen, this.#viewport.state)
    const pinHit = this.#pickPinAt(world)
    if (pinHit) { this.#openPinMenu(pinHit.nodeId, pinHit.pinId, screen); return }
    const nodeId = (this.#hoveredId !== null && this.graph.getNode(this.#hoveredId)) ? this.#hoveredId : this.#pickNodeAt(world)
    if (nodeId !== null) { this.#openNodeMenu(nodeId, screen); return }
    const tolerance = this.#theme.tokens.geometry.edge.midpointRadius + 5
    const edgeId = this.#pickEdgeAt(world, tolerance)
    if (edgeId) this.#openEdgeMenu(edgeId, screen)
  }

  /** Suppress the browser context menu — the editor opens its own on `pointerup` (`#onRightUp`)
   *  so right-button drag doesn't flash a menu mid-pan. */
  readonly #onContextMenu = (e: MouseEvent): void => {
    e.preventDefault()
  }

  /** Topmost pin whose hit area contains `world`, or null. Walks live views (so it respects pin
   *  positions at the current zoom + per-node row heights). Used by the right-click pin menu. */
  #pickPinAt(world: { x: number; y: number }): { nodeId: NodeId; pinId: string } | null {
    const r = this.#theme.tokens.geometry.pin.diameter / 2 + this.#theme.tokens.geometry.pin.hitPadding
    let best: { nodeId: NodeId; pinId: string } | null = null
    let bestDist = r
    for (const n of this.graph.nodes()) {
      if (this.#hiddenMembers.has(n.id)) continue
      for (const pin of (n as Node).pins) {
        const pos = this.#pinWorldPosition(n as Node, String(pin.id))
        if (!pos) continue
        const d = Math.hypot(world.x - pos.x, world.y - pos.y)
        if (d <= bestDist) { bestDist = d; best = { nodeId: n.id as NodeId, pinId: String(pin.id) } }
      }
    }
    return best
  }

  /** Open the pin context menu for one specific pin. MVP item: Unbind — disconnects every edge
   *  attached to that pin in one undoable transaction. */
  #openPinMenu(nodeId: NodeId, pinId: string, screen: { x: number; y: number }): void {
    const incident: EdgeId[] = []
    for (const edge of this.graph.edges()) {
      if ((edge.from.node === nodeId && String(edge.from.pin) === pinId) ||
          (edge.to.node   === nodeId && String(edge.to.pin)   === pinId)) {
        incident.push(edge.id as EdgeId)
      }
    }
    const menu = this.#ensureEdgeMenu()
    const items: EdgeMenuItem[] = []
    items.push({
      label: incident.length > 1 ? 'Unbind (all wires)' : 'Unbind',
      hint: incident.length > 0 ? `${incident.length} wire${incident.length === 1 ? '' : 's'}` : 'no wires',
      onSelect: () => {
        if (incident.length === 0) return
        this.commandBus.transaction(() => {
          for (const eid of incident) this.deleteEdge(eid)
        })
        this.#requestRender()
      },
    })
    menu.open(screen, items)
  }

  /** Topmost visible node whose box contains a world point (iteration order ≈ paint order, so the
   *  last match wins). Skips hidden macro members. Used by the right-click node menu. */
  #pickNodeAt(world: { x: number; y: number }): NodeId | null {
    let hit: NodeId | null = null
    for (const n of this.graph.nodes()) {
      if (this.#hiddenMembers.has(n.id)) continue
      const size = n.size ?? { x: 0, y: 0 }
      if (world.x >= n.position.x && world.x <= n.position.x + size.x &&
          world.y >= n.position.y && world.y <= n.position.y + size.y) hit = n.id as NodeId
    }
    return hit
  }

  /** Open the node context menu. Right-clicking a node that isn't part of the current selection
   *  selects just it first. Items depend on how many nodes are selected: one → Delete; many → Group
   *  (in-place collapse macro) or Convert to Template (reusable subgraph). */
  #openNodeMenu(nodeId: NodeId, screen: { x: number; y: number }): void {
    if (!this.selection.ids().some((id) => id === nodeId)) this.selection.replaceWith([nodeId])
    const count = this.selection.ids().length
    const menu = this.#ensureEdgeMenu()
    if (count <= 1) {
      // Rename is offered only for "our" nodes — template instances, macro groups, and a template's
      // I/O boundary nodes — not arbitrary nodes, to avoid confusing per-node title editing. Unpack /
      // Ungroup are the inverse of Convert to Template / Group.
      const node = this.graph.getNode(nodeId)
      const renamable = !!node && (isTemplateInstance(node) || isMacro(node) || isTemplateBoundary(node))
      const items: EdgeMenuItem[] = []
      if (renamable) items.push({ label: 'Rename', hint: 'F2', onSelect: () => this.#editNodeTitle(nodeId) })
      if (node && isTemplateInstance(node)) {
        items.push({ label: 'Convert to Group', hint: 'editable', onSelect: () => { this.convertTemplateInstanceToMacro(nodeId); this.#requestRender() } })
        items.push({ label: 'Unpack', hint: 'inline', onSelect: () => this.unpackTemplateInstance(nodeId) })
      } else if (node && isMacro(node)) {
        items.push({ label: 'Convert to Template', hint: 'reusable', onSelect: () => { this.convertMacroToTemplate(nodeId); this.#requestRender() } })
        items.push({ label: 'Ungroup', hint: 'dissolve', onSelect: () => this.ungroupMacro(nodeId) })
      }
      items.push({ label: 'Delete', hint: 'Del', onSelect: () => { this.deleteSelected(); this.#requestRender() } })
      menu.open(screen, items)
    } else {
      menu.open(screen, [
        { label: 'Group', hint: '⌘G', onSelect: () => { this.createMacroFromSelection(); this.#requestRender() } },
        { label: 'Convert to Template', hint: '⌘⇧G', onSelect: () => { this.createTemplateFromSelection(); this.#requestRender() } },
      ])
    }
  }

  /** Open the edge context menu at `screen` for `edgeId`. */
  #openEdgeMenu(edgeId: EdgeId, screen: { x: number; y: number }): void {
    const edge = this.graph.getEdge(edgeId)
    if (!edge) return
    const srcNode = this.graph.getNode(edge.from.node)
    const dstNode = this.graph.getNode(edge.to.node)
    const srcType = String(srcNode?.pins.find((p) => String(p.id) === String(edge.from.pin))?.type ?? 'any')
    const dstType = String(dstNode?.pins.find((p) => String(p.id) === String(edge.to.pin))?.type ?? 'any')
    const world = screenToWorld(screen, this.#viewport.state)
    if (!this.#edgeMenu) this.#edgeMenu = new EdgeContextMenu(this.#host, this.#theme.paletteStyle)
    this.#edgeMenu.open(screen, [
      { label: 'Add Reroute', hint: 'dot', onSelect: () => { this.insertRerouteOnEdge(edgeId, world); this.#requestRender() } },
      { label: 'Add Node', hint: 'search', onSelect: () => {
          this.#pendingEdgeSplice = { edgeId, srcType, dstType }
          this.openPalette(screen)
        } },
      { label: 'Delete', hint: 'break', onSelect: () => { this.deleteEdge(edgeId); this.#requestRender() } },
    ])
  }

  /** Force a repaint on the next frame regardless of internal dirty tracking. Hosts can call
   *  this after mutating the canvas element / DPR or any state the editor can't observe. */
  requestRender(): void { this.#requestRender() }

  /** Ephemeral position write — bypasses the command bus AND syncs the view + incident edges in
   *  the same beat. The autolayout plugin's tween uses this per animation frame; the FINAL
   *  position commits once through a normal MoveNode so undo stays clean. */
  #setNodePositionEphemeral(nodeId: NodeId, x: number, y: number): void {
    const node = this.graph.getNode(nodeId)
    if (!node) return
    ;(node as { position: { x: number; y: number } }).position = { x, y }
    const view = this.#views.get(nodeId)
    if (view) view.container.position.set(x, y)
    const incident = this.#edgesByNode.get(nodeId)
    if (incident) for (const eid of incident) this.#redrawEdge(eid)
    this.#requestRender()
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

  // ===== Themeable busy/rendering overlay ======================================================

  #ensureOverlay(): void {
    if (this.#overlayEl) return
    if (!document.getElementById('xeno-overlay-style')) {
      const style = document.createElement('style')
      style.id = 'xeno-overlay-style'
      style.textContent = '@keyframes xeno-spin { to { transform: rotate(360deg) } }'
      document.head.appendChild(style)
    }
    const el = document.createElement('div')
    el.setAttribute('data-xeno-overlay', '')
    Object.assign(el.style, {
      position: 'absolute', inset: '0', zIndex: '1500',
      display: 'none', alignItems: 'center', justifyContent: 'center',
      opacity: '0', pointerEvents: 'none',
      transition: 'opacity 260ms ease',
    } as Partial<CSSStyleDeclaration>)

    const card = document.createElement('div')
    Object.assign(card.style, {
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '14px 20px', borderRadius: '12px',
      font: "600 14px 'Inter', system-ui, sans-serif", letterSpacing: '0.02em',
    } as Partial<CSSStyleDeclaration>)

    const spinner = document.createElement('div')
    Object.assign(spinner.style, {
      width: '20px', height: '20px', borderRadius: '50%',
      borderStyle: 'solid', borderWidth: '2.5px',
      animation: 'xeno-spin 0.7s linear infinite',
    } as Partial<CSSStyleDeclaration>)

    const label = document.createElement('div')
    label.textContent = 'Rendering…'

    card.append(spinner, label)
    el.appendChild(card)
    if (getComputedStyle(this.#host).position === 'static') this.#host.style.position = 'relative'
    this.#host.appendChild(el)
    this.#overlayEl = el
    this.#overlayCard = card
    this.#overlaySpinner = spinner
    this.#overlayLabel = label
    this.#styleOverlay()
  }

  /** Apply the active theme's PaletteStyle to the overlay (frosted card for Liquid Glass, dark for
   *  Xen) plus an accent-coloured spinner. */
  #styleOverlay(): void {
    if (!this.#overlayEl) return
    const s = this.#theme.paletteStyle
    const accent = s?.accent ?? '#FCB400'
    const text = s?.textColor ?? '#FFFFFF'
    const muted = s?.mutedColor ?? 'rgba(255,255,255,0.25)'
    // Scrim: always a soft blur over the scene so the heavy first render is hidden.
    Object.assign(this.#overlayEl.style, {
      background: 'rgba(0, 0, 0, 0.28)',
      backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
    } as Partial<CSSStyleDeclaration>)
    Object.assign(this.#overlayCard!.style, {
      background: s?.panelBackground ?? 'rgba(20,20,20,0.7)',
      border: `1px solid ${s?.panelBorder ?? 'rgba(255,255,255,0.12)'}`,
      boxShadow: s?.panelShadow ?? '0 12px 40px rgba(0,0,0,0.5)',
      backdropFilter: s?.backdropFilter ?? 'none', WebkitBackdropFilter: s?.backdropFilter ?? 'none',
      color: text,
    } as Partial<CSSStyleDeclaration>)
    Object.assign(this.#overlaySpinner!.style, { borderColor: muted, borderTopColor: accent } as Partial<CSSStyleDeclaration>)
  }

  #overlayHideTimer: ReturnType<typeof setTimeout> | null = null

  /** Show the busy overlay with `label`, immediately (no fade-in) so it covers a blocking render. */
  showOverlay(label = 'Rendering…'): void {
    this.#ensureOverlay()
    if (this.#overlayHideTimer) { clearTimeout(this.#overlayHideTimer); this.#overlayHideTimer = null }
    if (this.#overlayLabel) this.#overlayLabel.textContent = label
    const el = this.#overlayEl!
    el.style.display = 'flex'
    el.style.transition = 'none'
    el.style.opacity = '1'
    // Force reflow so a subsequent fade-out animates from opacity 1.
    void el.offsetHeight
    el.style.transition = 'opacity 260ms ease'
  }

  /** Fade the busy overlay out, then fully detach it (`display:none`) so its backdrop blur stops
   *  costing GPU once hidden. */
  hideOverlay(): void {
    if (!this.#overlayEl) return
    const el = this.#overlayEl
    el.style.opacity = '0'
    if (this.#overlayHideTimer) clearTimeout(this.#overlayHideTimer)
    this.#overlayHideTimer = setTimeout(() => { el.style.display = 'none'; this.#overlayHideTimer = null }, 300)
  }

  /** Run `work` (a possibly-heavy, possibly-async load) behind the themeable busy overlay: the
   *  overlay paints first, then `work` runs, then we wait for the resulting render frame to paint,
   *  then fade the overlay out. Keeps big-graph loads smooth instead of a frozen pop-in. */
  async withOverlay<T>(label: string, work: () => T | Promise<T>): Promise<T> {
    this.showOverlay(label)
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    try {
      return await work()
    } finally {
      this.#requestRender()
      // Wait for the (heavy) render frame to actually paint before revealing the scene.
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
      this.hideOverlay()
    }
  }

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
    // Node/pin/widget text uses BitmapText — all instances of a given style share one glyph atlas
    // instead of allocating a texture per Text, which is the dominant cost on huge graphs. Bake the
    // atlas at device resolution so it stays crisp when zoomed in.
    BitmapFontManager.defaultOptions.resolution = Math.ceil(window.devicePixelRatio || 1)
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
    const editor = new XenolithEditor(app, el, theme, opts)
    // Debug aid for screenshot tooling, e2e probes, perf measurements — always expose the most
    // recently constructed editor on globalThis. Overwritten by next init, no leak.
    ;(globalThis as { __xenoEditor?: XenolithEditor }).__xenoEditor = editor
    return editor
  }

  // ----- theme hook wrappers ---------------------------------------------------------------
  // Every visual element goes through these so that #theme.<hook> wins when present, with the
  // built-in Xen renderer as a fallback. Keeps the rest of the editor agnostic to which theme
  // is currently active.

  #renderNode(node: Node, opts: RenderNodeOptions): NodeView {
    const enriched: RenderNodeOptions = {
      ...opts,
      ...(this.#categoryPalette ? { categoryPalette: this.#categoryPalette } : {}),
      renderer: this.#app.renderer as never,
      requestRender: this.#requestRender,
      customWidgets: this.#widgetControllers,
      types: this.#types,
      connectedPinIds: this.#connectedPinIdsFor(node.id),
      ...(this.#pinLiveValueFor(node.id) ? { pinLiveValue: this.#pinLiveValueFor(node.id)! } : {}),
      // Mark a node with a header glyph (explicit node.glyph, or the built-in template/group markers)
      // so kinds read apart without relying on colour.
      ...(() => { const g = this.#resolveGlyph(node); return g ? { glyph: g } : {} })(),
    }
    if (isReroute(node)) {
      return this.#theme.renderReroute?.(node, enriched, this.#themeContext())
        ?? renderRerouteNode(node, this.#theme.tokens, enriched)
    }
    if (node.type === REROUTE_NODE_TYPE) {
      return this.#theme.renderRerouteNode?.(node, enriched, this.#themeContext())
        ?? renderRerouteNodeBox(node, this.#theme.tokens, enriched)
    }
    // Mid-zoom sprite LOD: a baked-texture sprite instead of the live node (recognisable + cheap, and
    // for Liquid Glass it skips the per-node backdrop RTs that make overlaps crawl).
    if (this.#lodLevel === 'sprite') return this.#spriteViewFor(node)
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

  /** Reconcile comment-frame VIEWS with the graph's comments, viewport-virtualized exactly like
   *  nodes: past the threshold only comments intersecting the viewport band get a live PIXI view
   *  (each owns FillGradient textures + a BitmapText — thousands of them off-screen is what crashed
   *  a doubled-up demo). Off-screen comments stay as graph data and re-materialise on pan. */
  #syncComments(): void {
    const virtualize = this.#virtualizeActive()
    const bands = virtualize ? this.#virtualizeBands() : null
    const seen = new Set<string>()
    for (const c of this.graph.comments()) {
      seen.add(String(c.id))
      const live = this.#commentViews.has(c.id)
      let want = true
      if (bands) {
        const r = { x: c.position.x, y: c.position.y, width: c.size.x, height: c.size.y }
        want = live ? rectIntersects(r, bands.outer) : rectIntersects(r, bands.inner)
      }
      if (!want) { if (live) this.#destroyCommentView(c.id); continue }
      this.#ensureCommentView(c as Comment)
    }
    for (const [id] of [...this.#commentViews]) {
      if (!seen.has(String(id))) { this.#destroyCommentView(id); this.#selectedComments.delete(id) }
    }
    this.#requestRender()
  }

  /** Create the view if missing (or refresh it), restoring selected visual + LOD state. */
  #ensureCommentView(c: Comment): void {
    const existing = this.#commentViews.get(c.id)
    if (existing) { existing.update(c); return }
    const view = renderComment(c, this.#theme.tokens, this.#theme.commentHeaderStyle ?? 'gradient')
    if (this.#lodLevel !== 'full') view.setSimplified(true)
    if (this.#selectedComments.has(c.id)) view.setVisualState('selected')
    this.#commentViews.set(c.id, view)
    this.#commentsLayer.addChild(view.container)
    this.#commentHeadersLayer.addChild(view.headerLayer)
    this.#wireCommentInteraction(c.id, view)
  }

  /** Drop a comment's live view (frees gradients + BitmapText); the graph data + selection remain. */
  #destroyCommentView(id: CommentId): void {
    const v = this.#commentViews.get(id)
    if (!v) return
    v.destroy()
    this.#commentViews.delete(id)
  }

  /** Wire a comment's header (drag-to-move-with-contents, double-click-to-rename) and resize grip. */
  #wireCommentInteraction(id: CommentId, view: CommentView): void {
    view.header.on('pointerover', () => { if (!this.#selectedComments.has(id)) { view.setVisualState('hover'); this.#requestRender() } })
    view.header.on('pointerout', () => { if (!this.#selectedComments.has(id)) { view.setVisualState('default'); this.#requestRender() } })
    // Right-click → context menu: rename, recolour (built-in colour picker), delete.
    view.header.on('rightdown', (e: FederatedPointerEvent) => {
      if (!this.#interactive) return
      e.stopPropagation()
      this.#ensureEdgeMenu().open({ x: e.global.x, y: e.global.y }, [
        { label: 'Rename', onSelect: () => this.#editCommentText(id, view) },
        { label: 'Colour…', onSelect: () => this.#editCommentColor(id, view) },
        { label: 'Delete', onSelect: () => this.removeComment(id) },
      ])
    })
    view.header.on('pointerdown', (e: FederatedPointerEvent) => {
      if (e.button !== 0 || !this.#interactive) return
      e.stopPropagation()
      this.#selectComment(id)
      const now = performance.now()
      if (now - this.#commentLastTap < 320) {
        this.#commentLastTap = 0
        this.#commentDrag = null
        // Defer past this pointer event — opening/focusing the input synchronously inside pointerdown
        // lets the rest of the gesture steal focus, so the field never appears (menu Rename works
        // because it fires from a separate, later event).
        requestAnimationFrame(() => this.#editCommentText(id, this.#commentViews.get(id) ?? view))
        return
      }
      this.#commentLastTap = now
      const c = this.graph.getComment(id)
      if (!c) return
      // Capture the nodes sitting inside the frame NOW; drag moves them together with it.
      const members = nodesInsideComment(c, [...this.graph.nodes()])
      const nodeStarts = new Map<NodeId, { x: number; y: number }>()
      for (const nid of members) {
        const n = this.graph.getNode(nid)
        if (n) nodeStarts.set(nid, { x: n.position.x, y: n.position.y })
      }
      this.#commentDrag = {
        kind: 'move', id,
        startScreen: { x: e.global.x, y: e.global.y },
        commentStart: { x: c.position.x, y: c.position.y },
        nodeStarts,
      }
    })
    view.resizeHandle.on('pointerdown', (e: FederatedPointerEvent) => {
      if (e.button !== 0 || !this.#interactive) return
      e.stopPropagation()
      const c = this.graph.getComment(id)
      if (!c) return
      this.#commentDrag = { kind: 'resize', id, startScreen: { x: e.global.x, y: e.global.y }, sizeStart: { x: c.size.x, y: c.size.y } }
    })
  }

  /** Live-drag the comment frame (and, in 'move', its captured member nodes); returns true if it
   *  handled the move so the caller can early-out of the node-drag path. */
  #updateCommentDrag(screen: { x: number; y: number }): void {
    const d = this.#commentDrag
    if (!d) return
    const zoom = this.#viewport.state.zoom
    const dx = (screen.x - d.startScreen.x) / zoom
    const dy = (screen.y - d.startScreen.y) / zoom
    const view = this.#commentViews.get(d.id)
    const c = this.graph.getComment(d.id)
    if (!view || !c) return
    if (d.kind === 'move') {
      view.container.position.set(d.commentStart.x + dx, d.commentStart.y + dy)
      view.headerLayer.position.set(d.commentStart.x + dx, d.commentStart.y + dy)
      const affected = new Set<EdgeId>()
      for (const [nid, start] of d.nodeStarts) {
        this.#views.get(nid)?.container.position.set(start.x + dx, start.y + dy)
        for (const eid of this.#edgesByNode.get(nid) ?? []) affected.add(eid)
      }
      for (const eid of affected) this.#redrawEdge(eid)
    } else {
      const geo = this.#theme.tokens.geometry.comment
      const w = Math.max(geo.minWidth, d.sizeStart.x + dx)
      const h = Math.max(geo.minHeight, d.sizeStart.y + dy)
      view.update({ ...(c as Comment), size: { x: w, y: h } })
    }
    this.#requestRender()
  }

  /** Commit the live comment drag/resize through the command bus (one undoable step). */
  #endCommentDrag(screen: { x: number; y: number }): void {
    const d = this.#commentDrag
    if (!d) return
    this.#commentDrag = null
    const zoom = this.#viewport.state.zoom
    const dx = (screen.x - d.startScreen.x) / zoom
    const dy = (screen.y - d.startScreen.y) / zoom
    if (d.kind === 'move') {
      if (dx === 0 && dy === 0) return
      this.commandBus.transaction(() => {
        this.commandBus.apply(new MoveComment(d.id, { x: d.commentStart.x + dx, y: d.commentStart.y + dy }))
        for (const [nid, start] of d.nodeStarts) {
          this.commandBus.apply(new MoveNode(nid, { x: start.x + dx, y: start.y + dy }))
        }
      })
    } else {
      const geo = this.#theme.tokens.geometry.comment
      const w = Math.max(geo.minWidth, d.sizeStart.x + dx)
      const h = Math.max(geo.minHeight, d.sizeStart.y + dy)
      this.commandBus.apply(new ResizeComment(d.id, { x: w, y: h }))
    }
  }

  /** Open the inline editor over a comment's header to rename it. */
  #editCommentText(id: CommentId, view: CommentView): void {
    const c = this.graph.getComment(id)
    if (!c) return
    const vp = this.#viewport.state
    const sx = c.position.x * vp.zoom + vp.x
    const sy = c.position.y * vp.zoom + vp.y
    const t = this.#theme.tokens
    const ct = t.typography.comment
    const base = c as Comment
    // The DOM field stays fully transparent and borderless — only its caret shows. The visible glyphs
    // are the live WebGL title (updated per keystroke via onInput), so ZERO font-metric mismatch and
    // the text never shifts. setEditing(true) makes the title show its FULL text (no ellipsis) while
    // editing — it may run past the frame, which is fine; the user sees everything they type.
    view.setEditing(true)
    this.#requestRender()
    this.#ensureWidgetOverlay().editText({
      rect: { x: sx, y: sy, width: c.size.x * vp.zoom, height: view.headerHeight * vp.zoom },
      value: c.text,
      style: {
        background:  'transparent',
        text:        'transparent',
        border:      'transparent',
        borderWidth: 0,
        radius:      0,
        paddingX:    10 * vp.zoom,
        paddingY:    2 * vp.zoom,
        fontSize:    ct.size * vp.zoom,
        fontFamily:  t.typography.fontFamily,
        fontWeight:  '700',
        placeholder: '',
        selection:   'transparent',
      },
      caretColor: ct.color,
      selectAll: false,
      autoGrow: true,
      onInput:  (text: string) => { this.#commentViews.get(id)?.update({ ...base, text }); this.#requestRender() },
      onCommit: (text: string) => { this.commandBus.apply(new SetCommentText(id, text)); this.#syncComments() },
      // Restore ellipsis truncation + re-sync from the graph (an Escape/cancel reverts the preview).
      onClose:  () => { this.#commentViews.get(id)?.setEditing(false); this.#syncComments() },
    })
  }

  /** Open the built-in colour picker over a comment's header; live-preview, commit one undoable step. */
  #editCommentColor(id: CommentId, view: CommentView): void {
    const c = this.graph.getComment(id)
    if (!c) return
    const vp = this.#viewport.state
    const sx = c.position.x * vp.zoom + vp.x
    const sy = c.position.y * vp.zoom + vp.y
    this.#ensureWidgetOverlay().editColor({
      rect: { x: sx, y: sy, width: c.size.x * vp.zoom, height: view.headerHeight * vp.zoom },
      value: c.color ?? '#8A38F5',
      onInput: (hex: string) => { view.update({ ...(c as Comment), color: hex }); this.#requestRender() },
      onCommit: (hex: string) => this.setCommentColor(id, hex),
    })
  }

  /** True when a DOM input/textarea/select/contenteditable has focus (a widget or comment editor) —
   *  callers suppress canvas zoom/pan so the wheel scrolls/does nothing instead of warping the view. */
  #htmlFieldFocused(): boolean {
    const el = document.activeElement as HTMLElement | null
    if (!el) return false
    const tag = el.tagName
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
  }

  #ensureEdgeMenu(): EdgeContextMenu {
    if (!this.#edgeMenu) this.#edgeMenu = new EdgeContextMenu(this.#host, this.#theme.paletteStyle)
    return this.#edgeMenu
  }

  /** Select a comment exclusively (clears node selection + any other comment). */
  #selectComment(id: CommentId): void {
    if (this.#selectedComments.size === 1 && this.#selectedComments.has(id)) return
    this.#clearCommentSelection()
    if (this.selection.size > 0) { this.selection.clear(); this.#updateVisualStates() }
    this.#selectedComments.add(id)
    const v = this.#commentViews.get(id)
    if (v) {
      v.setVisualState('selected')
      // Raise above other comments so a comment dragged over another sits on top (both layers).
      this.#commentsLayer.setChildIndex(v.container, this.#commentsLayer.children.length - 1)
      this.#commentHeadersLayer.setChildIndex(v.headerLayer, this.#commentHeadersLayer.children.length - 1)
    }
    this.#requestRender()
  }

  #clearCommentSelection(): void {
    if (this.#selectedComments.size === 0) return
    for (const id of this.#selectedComments) this.#commentViews.get(id)?.setVisualState('default')
    this.#selectedComments.clear()
  }

  /** Make the background grid effectively infinite: instead of one giant fixed TilingSprite (which
   *  runs out on huge graphs — hence empty zones when you pan far), resize/reposition it to cover
   *  exactly the visible world rect each viewport change, keeping the dot pattern phase-aligned to
   *  the world grid. Only applies to the default TilingSprite grid; custom theme grids are left as-is. */
  #updateGrid(): void {
    const layer = this.#gridLayer
    // The grid TilingSprite is the layer itself (Xen) or nested in a backdrop Container (Liquid
    // Glass wraps it with a gradient sprite). Find whichever and keep it covering the viewport.
    const g = layer instanceof TilingSprite
      ? layer
      : layer?.children.find((c): c is TilingSprite => c instanceof TilingSprite)
    if (!g) return
    const vp = this.#viewport.state
    const sw = Math.max(1, this.#app.screen.width)
    const sh = Math.max(1, this.#app.screen.height)
    const rect = visibleWorldRect(sw, sh, vp, 64) // small overscan so a fast pan never shows an edge
    g.position.set(rect.x, rect.y)
    g.width = rect.width
    g.height = rect.height
    const spacing = this.#theme.tokens.background.grid.spacing
    g.tilePosition.set(-rect.x % spacing, -rect.y % spacing)
  }

  #createBackdropRT(): RenderTexture {
    const rt = RenderTexture.create({
      width:      Math.max(1, this.#app.screen.width),
      height:     Math.max(1, this.#app.screen.height),
      resolution: this.#app.renderer.resolution,
      antialias:  true,
    })
    // Clear to the canvas colour immediately so glass nodes that render before the first
    // #updateBackdrop sample the background, not an uninitialised (black) texture.
    this.#app.renderer.render({
      container: new Container(), target: rt, clear: true,
      clearColor: this.#theme.tokens.color.surface.canvas,
    })
    return rt
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

    // Comment frames (body + header layers) are NOT part of the glass refraction stack — keep them
    // out of every backdrop render so glass nodes don't sample/refract them (and we don't pay to
    // draw them per node).
    const commentsWereVisible = this.#commentsLayer.visible
    const commentHeadersWereVisible = this.#commentHeadersLayer.visible
    const macroFramesWereVisible = this.#macroFramesLayer.visible
    const macroOverlayWasVisible = this.#macroOverlayLayer.visible
    this.#commentsLayer.visible = false
    this.#commentHeadersLayer.visible = false
    this.#macroFramesLayer.visible = false
    this.#macroOverlayLayer.visible = false

    // Paint-order list of node IDs with their world-space AABBs. During a drag we use the
    // container.position (live, snap-aware) instead of node.position (only committed on drop)
    // so overlap detection works during the drag, not after.
    const rects: { id: string; x: number; y: number; width: number; height: number }[] = []
    const containerById = new Map<string, Container>()
    for (const [id, view] of this.#views) {
      const node = this.graph.getNode(id)
      if (!node) continue
      // Skip nodes that aren't part of the live node layer: collapsed-macro members (hidden) and
      // expanded-macro members (in the overlay). Otherwise Pass 2 would toggle them visible into a
      // personal backdrop RT and the glass node above would refract those ghosts (the LG artifact).
      if (this.#hiddenMembers.has(id) || view.container.parent !== this.#nodesLayer) continue
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

    // Clear the backdrop RTs to the canvas colour, not transparent/black — the world backdrop
    // (gradient + grid) is finite, so anything a glass node samples beyond its extent must read as
    // the background, otherwise far-out nodes refract a black void.
    const clearColor = this.#theme.tokens.color.surface.canvas

    // Pass 1 — shared base backdrop: hide every node, render stage, restore.
    const nodesWereVisible = this.#nodesLayer.visible
    this.#nodesLayer.visible = false
    this.#app.renderer.render({ container: this.#app.stage, target: this.#backdropRT, clearColor })
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
        this.#app.renderer.render({ container: this.#app.stage, target: rt, clearColor })
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
    this.#commentsLayer.visible = commentsWereVisible
    this.#commentHeadersLayer.visible = commentHeadersWereVisible
    this.#macroFramesLayer.visible = macroFramesWereVisible
    this.#macroOverlayLayer.visible = macroOverlayWasVisible
  }

  /** Theme hooks read this to drive backdrop-sampling shaders. */
  #themeContext(): ThemeRenderContext {
    return { backdropTexture: this.#backdropRT?.source ?? null }
  }

  /** Build a text measurer from the active theme's font family. Falls back to a crude char-width
   *  estimate when CanvasTextMetrics is unavailable (no 2D canvas — e.g. some test envs). */
  #makeTextMeasure(theme: XenolithTheme): TextMeasurer {
    const fontFamily = theme.tokens.typography.fontFamily
    try {
      const pixi = createPixiTextMeasurer(fontFamily)
      pixi('test', 12, 700) // probe — throws here if there is no canvas backend
      return pixi
    } catch {
      return (text, fontSize) => text.length * fontSize * 0.55
    }
  }

  #sizeTokens(): NodeSizeTokens {
    const g = this.#theme.tokens.geometry
    const t = this.#theme.tokens.typography
    return {
      node:   { minWidth: g.node.minWidth, headerHeight: g.node.headerHeight, headerPadding: g.node.headerPadding },
      pin:    { diameter: g.pin.diameter, rowSpacing: g.pin.rowSpacing, rowHeight: g.pin.rowHeight, labelGap: g.pin.labelGap },
      header: { toPinsGap: g.header.toPinsGap, chevronSize: g.header.chevronSize, titleGap: g.header.titleGap },
      typography: {
        titleSize: t.heading.size, titleWeight: t.heading.weight,
        labelSize: t.label.size,   labelWeight: t.label.weight,
      },
      widget: { rowHeight: g.widget.rowHeight, gap: g.widget.gap, controlMinWidth: g.widget.controlMinWidth },
    }
  }

  /** Backfill a content-derived size when the host/command gave none (palette inserts, ComfyUI
   *  imports, reroute splices). One resolved size keeps renderer, geom bounds, edge endpoints and
   *  backdrop in sync. Called from both `addNode` and the command-driven sync path. */
  #ensureSize(node: Node, render: RenderNodeOptions): void {
    if (node.size) return
    node.size = isReroute(node)
      ? rerouteSize(this.#theme.tokens)
      : node.type === REROUTE_NODE_TYPE
        ? rerouteBoxSize(this.#theme.tokens)
        : measureNodeSize(node, render.title ?? node.type, this.#sizeTokens(), this.#textMeasure, (k) => this.#isPinConnected(node.id, k))
  }

  /** Add a node as DATA only — graph model + render opts + size, no PIXI view. Used by the
   *  virtualized loadJSON path where views are materialised lazily by #cullToViewport(). */
  #addNodeData(node: Node, render: RenderNodeOptions = {}): void {
    this.#ensureSize(node, render)
    this.graph._addNode(node)
    this.#renderOpts.set(node.id, render)
    this.#addToSpatialGrid(node)
  }

  addNode(node: Node, render: RenderNodeOptions = {}): Node {
    this.#addNodeData(node, render)
    // Virtualized + off-screen → leave it as data; #cullToViewport materialises it when it scrolls
    // into view. This is what lets procedural mass-adds (addNode in a loop) stay bounded too.
    if (!this.#virtualizeActive() || this.#nodeIntersects(node, this.#virtualizeBands().inner)) {
      this.#ensureView(node)
    }
    if (node.widgets?.some((w) => w.type === 'custom')) this.#syncDomWidgets()
    this.#scheduleMinimapSync()
    this.#requestRender()
    return node
  }

  // ----- comments (public API) — all go through the command bus, so they're undoable -----

  /** Add a comment/group frame. Defaults to a frame at the last cursor world-position. Returns its id. */
  addComment(opts: { position?: { x: number; y: number }; size?: { x: number; y: number }; text?: string; color?: string } = {}): CommentId {
    const id = createCommentId()
    const comment: Comment = {
      id,
      position: opts.position ?? (this.#lastPointerWorld ? { ...this.#lastPointerWorld } : { x: 0, y: 0 }),
      size: opts.size ?? { x: 240, y: 160 },
      text: opts.text ?? 'Comment',
      ...(opts.color !== undefined ? { color: opts.color } : {}),
    }
    this.commandBus.apply(new AddComment(comment))
    return id
  }

  removeComment(id: CommentId): void {
    if (this.graph.getComment(id)) this.commandBus.apply(new RemoveComment(id))
  }

  setCommentText(id: CommentId, text: string): void {
    if (this.graph.getComment(id)) this.commandBus.apply(new SetCommentText(id, text))
  }

  setCommentColor(id: CommentId, color: string): void {
    const c = this.graph.getComment(id)
    if (c) this.commandBus.apply(new SetCommentText(id, c.text, color))
  }

  // ----- macro (public API) — inline collapse, pin-proxied; all through the command bus -----

  /** Group nodes into a collapsed macro. Boundary edges are rewired onto proxy pins (planMacroCollapse);
   *  members + internal edges hide. Defaults to the current selection. Returns the macro's id, or null
   *  if there's nothing groupable (macros can't be nested into a new macro here). */
  createMacroFromSelection(memberIds?: NodeId[], title = 'Macro'): NodeId | null {
    const ids = (memberIds ?? this.selection.ids()) as NodeId[]
    // Members may themselves be macros — macro-in-macro nesting is allowed (a nested macro is just a
    // collapsed node with proxy pins by the time it's a member). Template interface boundary nodes
    // ($templateInput/$templateOutput) are NEVER groupable — they ARE the template's in/out pins, and
    // collapsing them away would silently destroy the interface.
    const members = ids.filter((id) => { const n = this.graph.getNode(id); return !!n && !isTemplateBoundary(n) })
    if (members.length === 0) return null
    let minX = Infinity, minY = Infinity
    for (const id of members) { const n = this.graph.getNode(id)!; minX = Math.min(minX, n.position.x); minY = Math.min(minY, n.position.y) }
    // Place the collapsed macro at the top-left of its members (so it lands where the anchor node was,
    // not floating above the group).
    const macro = createMacro({ x: minX, y: minY }, members)
    const edges = [...this.graph.edges()] as Edge[]
    // Lift free widget-bound IN-pins of every member onto the macro so the macro's pin surface
    // matches Convert-to-Template (which exposes the same open boundary pins). Without this, the
    // user collapsing a Transform+Validate group loses access to its `scale/mode/mirror/response`
    // widget pins — the bug from 2026-05-30 (image #25/#26).
    const incomingByPin = new Set<string>()
    for (const e of edges) incomingByPin.add(String(e.to.pin))
    const hasIncoming = (pinId: PinId): boolean => incomingByPin.has(String(pinId))
    const liftPins: { node: NodeId; pin: PinId }[] = []
    for (const id of members) {
      const n = this.graph.getNode(id) as Node | undefined
      if (!n) continue
      for (const lift of disconnectedWidgetBoundPins(n, hasIncoming)) liftPins.push(lift)
    }
    const plan = planMacroCollapse(macro.id, members, edges, (n, p) => this.#pinInfo(n, p), { pin: createPinId, edge: createEdgeId }, { liftPins })
    macro.pins = plan.pins
    macro.state['proxyMap'] = plan.proxyMap as unknown
    // Collapsed macro reads as an ORDINARY node with pins (NOT a pill) — render.collapsed stays false;
    // state.collapsed (macro semantics: members hidden) is the toggle. Title names the group.
    const render: RenderNodeOptions = { category: 'macro', title }
    this.#renderOpts.set(macro.id, render)
    this.commandBus.transaction(() => {
      this.commandBus.apply(new AddNode(macro))
      for (const eid of plan.disconnect) this.commandBus.apply(new DisconnectEdge(eid))
      for (const e of plan.connect) this.commandBus.apply(new ConnectPins(e))
    })
    this.selection.replaceWith([macro.id])
    return macro.id
  }

  /** Ungroup a collapsed/expanded macro: dissolve the `Macro` wrapper and leave its members in the
   *  graph with their original edges restored. Undoable as one transaction. */
  ungroupMacro(id: NodeId): boolean {
    const macro = this.graph.getNode(id)
    if (!macro || !isMacro(macro)) return false
    const members = macroMembers(macro as Node)
    this.commandBus.transaction(() => {
      // If collapsed, move every edge currently on a macro proxy pin back onto the member pin it
      // proxies. We reconnect by the edge's CURRENT endpoints (not the stored proxyMap edgeId), so it
      // survives a neighbour macro having re-pointed the edge (macro→macro proxy↔proxy) — that
      // staleness is what made the old planMacroExpand path throw "edge not found".
      if (macro.state['collapsed']) {
        const proxyMap = (macro.state['proxyMap'] ?? []) as MacroProxyRecord[]
        const pinToMember = new Map<string, { node: NodeId; pin: PinId; dir: 'in' | 'out' }>()
        for (const r of proxyMap) pinToMember.set(String(r.macroPin), { node: r.memberNode, pin: r.memberPin, dir: r.direction })
        for (const e of [...this.graph.edges()] as Edge[]) {
          if (e.to.node === id && pinToMember.has(String(e.to.pin))) {
            const m = pinToMember.get(String(e.to.pin))!
            this.commandBus.apply(new DisconnectEdge(e.id))
            this.commandBus.apply(new ConnectPins({ id: createEdgeId(), from: { ...e.from }, to: { node: m.node, pin: m.pin } }))
          } else if (e.from.node === id && pinToMember.has(String(e.from.pin))) {
            const m = pinToMember.get(String(e.from.pin))!
            this.commandBus.apply(new DisconnectEdge(e.id))
            this.commandBus.apply(new ConnectPins({ id: createEdgeId(), from: { node: m.node, pin: m.pin }, to: { ...e.to } }))
          }
        }
      }
      this.commandBus.apply(new RemoveNode(id))
    })
    this.#applyMacroVisibility()
    this.selection.replaceWith(members.filter((m) => !!this.graph.getNode(m)))
    this.#requestRender()
    return true
  }

  // ----- live-template (public API) — reusable subgraph: one definition, many instances -----

  /** The reusable template definitions registered in this document, keyed by id. */
  get definitions(): ReadonlyMap<TemplateDefId, TemplateDefinition> { return this.#definitions }

  /** Convert a selection into a reusable template: the members move into a fresh definition (with
   *  auto-derived `$templateInput`/`$templateOutput` boundary nodes), the outer graph keeps a single
   *  `$templateInstance` node wired in their place. Returns the instance node id, or null if there's
   *  nothing to extract. Undoable as one transaction. */
  createTemplateFromSelection(memberIds?: NodeId[], title = 'Template'): NodeId | null {
    const ids = (memberIds ?? this.selection.ids()) as NodeId[]
    // Templates operate on FREE nodes only. Skip macro nodes and any node that is a member of a macro
    // (e.g. an expanded Gather/Pack's inlets/Merge/Sub), so converting a selection that overlaps a
    // macro can't drag the macro's guts into the template or orphan the macro by moving its members.
    // Also skip template interface boundaries ($templateInput/$templateOutput): they ARE the parent
    // template's in/out pins — pulling them into a nested template would destroy the interface.
    const members = ids
      .map((id) => this.graph.getNode(id))
      .filter((n): n is Node => !!n && !isMacro(n) && !isTemplateBoundary(n) && this.#macroParentOf(n.id) === undefined) as Node[]
    return this.#extractTemplateFromMembers(members, title)
  }

  /** Core template-extraction step shared by the public Cmd+Shift+G path and the macro-conversion
   *  path. Trusts the caller's member list (no filtering) — the public entry filters first.
   *  `hiddenMembers` go into the definition + are removed from the outer graph but DON'T contribute
   *  to the template interface — used for nested-macro members whose pins are behind a proxy. */
  #extractTemplateFromMembers(members: Node[], title: string, hiddenMembers: Node[] = []): NodeId | null {
    if (members.length === 0) return null
    let minX = Infinity, minY = Infinity
    for (const m of members) { minX = Math.min(minX, m.position.x); minY = Math.min(minY, m.position.y) }
    const instanceId = createNodeId()
    const plan = planTemplateExtraction(
      instanceId, members, [...this.graph.edges()] as Edge[],
      (n, p) => this.#pinInfo(n, p),
      { node: createNodeId, pin: createPinId, edge: createEdgeId, def: () => createNodeId() as unknown as TemplateDefId },
      title,
      hiddenMembers,
    )
    this.#definitions.set(plan.definition.id, plan.definition)
    this.#registerTemplateSchema(plan.definition.id)
    // Boundary nodes get minimal render opts so the dived-in view (and serialization) name them.
    for (const bn of plan.definition.nodes) {
      if (!this.#renderOpts.has(bn.id) && (bn.type === '$templateInput' || bn.type === '$templateOutput')) {
        this.#renderOpts.set(bn.id, { category: 'utility', title: bn.type === '$templateInput' ? 'In' : 'Out' })
      }
    }
    const instance: Node = {
      id: instanceId, type: TEMPLATE_INSTANCE_TYPE, position: { x: minX, y: minY },
      state: { definitionId: plan.definition.id, pinBoundary: plan.pinBoundary }, pins: plan.instancePins,
    }
    this.#renderOpts.set(instanceId, { category: 'macro', title })
    this.commandBus.transaction(() => {
      this.commandBus.apply(new AddNode(instance))
      for (const eid of plan.outerDisconnect) this.commandBus.apply(new DisconnectEdge(eid))
      for (const id of plan.removeFromOuter) this.commandBus.apply(new RemoveNode(id))
      for (const e of plan.outerConnect) this.commandBus.apply(new ConnectPins(e))
    })
    this.selection.replaceWith([instanceId])
    return instanceId
  }

  /** (Re)register a definition as a palette schema so it shows in Tab search and can be inserted as a
   *  fresh instance. Pins mirror the current interface; call after create / rename / interface edit. */
  #registerTemplateSchema(defId: TemplateDefId): void {
    const def = this.#definitions.get(defId)
    if (!def) return
    const iface = templateInterface(def)
    this.#templateRegistry.register({
      type: String(defId),
      title: def.title,
      category: 'macro',
      description: 'Reusable template instance',
      keywords: ['template', 'subgraph', def.title.toLowerCase()],
      pins: iface.map((s) => ({ kind: 'data', direction: s.direction, type: s.type, multiple: s.direction === 'out', ...(s.label !== undefined ? { label: s.label } : {}) })),
    })
  }

  /** Rename a template definition — updates its title, every live instance's displayed title, the
   *  palette entry, and the breadcrumb. */
  renameTemplate(defId: TemplateDefId, title: string): void {
    const def = this.#definitions.get(defId)
    if (!def || title.trim() === '') return
    def.title = title
    for (const g of new Set([this.#rootGraph, this.#displayGraph])) {
      for (const n of g.nodes()) {
        if (!isTemplateInstance(n) || n.state['definitionId'] !== defId) continue
        const r = this.#renderOpts.get(n.id) ?? {}; r.title = title; this.#renderOpts.set(n.id, r)
        if (this.#views.has(n.id)) this.#resizeNodeView(n.id)
      }
    }
    this.#registerTemplateSchema(defId)
    this.#updateBreadcrumb()
    this.#requestRender()
  }

  /** Unpack a `$templateInstance`: inline a fresh copy of its definition's members into the current
   *  graph (boundary nodes dissolve, outer edges reconnect to the member pins), then remove the
   *  instance. The definition and other instances are untouched. Undoable as one transaction. */
  unpackTemplateInstance(id: NodeId): boolean {
    const inst = this.graph.getNode(id)
    if (!inst || !isTemplateInstance(inst)) return false
    const defId = inst.state['definitionId'] as TemplateDefId | undefined
    const def = defId !== undefined ? this.#definitions.get(defId) : undefined
    if (!def) return false
    const plan = planTemplateUnpack(inst as Node, def, [...this.graph.edges()] as Edge[], { node: createNodeId, pin: createPinId, edge: createEdgeId })
    // Carry render opts (title/category/colour) from each definition member onto its inlined copy.
    for (const [oldId, newId] of Object.entries(plan.nodeRemap)) {
      const ro = this.#renderOpts.get(oldId as NodeId)
      if (ro) this.#renderOpts.set(newId as NodeId, { ...ro })
    }
    this.commandBus.transaction(() => {
      for (const n of plan.addNodes) this.commandBus.apply(new AddNode(n))
      for (const eid of plan.removeEdges) this.commandBus.apply(new DisconnectEdge(eid))
      this.commandBus.apply(new RemoveNode(id))
      for (const e of plan.addEdges) this.commandBus.apply(new ConnectPins(e))
    })
    // Selection covers TOP-LEVEL inlined members only. A node that's `state.members` of a nested
    // Macro that's also in the inlined set is "inside" — leaving it in the selection would let a
    // follow-up createMacroFromSelection list it BOTH on the new outer macro AND on the nested
    // one (double membership → phantom interface pins on the next convert-to-template cycle).
    const inlinedIds = new Set(plan.addNodes.map((n) => String(n.id)))
    const insideAnother = new Set<string>()
    for (const n of plan.addNodes) {
      if (n.type !== 'Macro') continue
      for (const m of macroMembers(n)) if (inlinedIds.has(String(m))) insideAnother.add(String(m))
    }
    this.selection.replaceWith(plan.addNodes.filter((n) => !insideAnother.has(String(n.id))).map((n) => n.id))
    this.#requestRender()
    return true
  }

  /** Convert a `$templateInstance` into an editable collapsed **Group** (Macro): inline a fresh copy of
   *  the definition's members, then wrap them in a macro. Now you can expand/edit it inline instead of
   *  diving — the link to the shared definition is dropped (it becomes a one-off group). Returns the
   *  new macro id, or null. */
  convertTemplateInstanceToMacro(id: NodeId): NodeId | null {
    const node = this.graph.getNode(id)
    if (!node || !isTemplateInstance(node)) return null
    const title = this.#renderOpts.get(id)?.title
    // Wrap unpack + re-collapse in a single outer transaction so one Ctrl+Z undoes the whole
    // conversion atomically (the inner methods' transactions join the outer one — without this,
    // undo only rolls back the macro re-collapse and leaves the graph as a sea of inlined members).
    let macroId: NodeId | null = null
    this.commandBus.transaction(() => {
      if (!this.unpackTemplateInstance(id)) return // inlines members + selects them
      macroId = this.createMacroFromSelection(undefined, title ?? 'Group') // wraps the selection in a macro
    })
    return macroId
  }

  /** Convert a **Group** (Macro) into a reusable **Template**: dissolve the macro, then extract a
   *  template definition + instance from the FULL subgraph (its direct members + transitively any
   *  nested macros' members). Nested collapsed macros become collapsed Macro nodes inside the
   *  definition — diving into the template, you still see them as groups. Returns the instance id. */
  convertMacroToTemplate(id: NodeId): NodeId | null {
    const node = this.graph.getNode(id)
    if (!node || !isMacro(node)) return null
    const title = this.#renderOpts.get(id)?.title
    // Wrap ungroup + template-extraction in one outer transaction so a single Ctrl+Z atomically
    // restores the original collapsed macro. Without this, undo only rolled back the extraction
    // and left the macro dissolved into loose members across the canvas.
    let instanceId: NodeId | null = null
    this.commandBus.transaction(() => {
      if (!this.ungroupMacro(id)) return // dissolves outer macro + selects its direct members
      // Direct members shape the template's interface (their boundary-crossing pins become In/Out
      // boundaries). Nested-macro members are pulled in as HIDDEN (definition-only): they're behind
      // their parent macro's proxy pins so have no real edges, and iterating their pins would mint
      // phantom $templateInput/$templateOutput for every "free-looking" pin. They still must come
      // along — the parent macro references them by id, so leaving them in the outer graph would
      // orphan them.
      //
      // Iteration is IN ORDER of the original macro's `state.members` so the resulting template
      // instance's pins appear in the same order as the macro's proxy pins (A, B, C — not C, B, A
      // from a stack-pop reversal that bit us before).
      const direct = this.selection.ids() as NodeId[]
      const directSet = new Set(direct.map(String))
      // Defensive: if `direct` somehow contains BOTH a Macro AND nodes that are members of it
      // (e.g. an unpack→re-collapse cycle left them flat in the outer macro's `state.members`),
      // demote those inner-via-another-macro members to "hidden" so their pins don't double up.
      const memberOfAnotherMacroInDirect = new Set<string>()
      for (const nid of direct) {
        const n = this.graph.getNode(nid)
        if (n && isMacro(n)) {
          for (const m of macroMembers(n as Node)) {
            if (directSet.has(String(m))) memberOfAnotherMacroInDirect.add(String(m))
          }
        }
      }
      const interfaceMembers: Node[] = []
      const hidden: Node[] = []
      const seen = new Set<string>()
      // Pass 1 — direct selection in order. Each ends up in `interfaceMembers` unless it's already
      // claimed by another macro in `direct` (then it joins `hidden`).
      for (const nid of direct) {
        if (seen.has(String(nid))) continue
        seen.add(String(nid))
        const n = this.graph.getNode(nid)
        if (!n || isTemplateBoundary(n)) continue
        if (memberOfAnotherMacroInDirect.has(String(nid))) hidden.push(n as Node)
        else interfaceMembers.push(n as Node)
      }
      // Pass 2 — BFS into nested macros' members (these weren't in `direct` so they were never
      // selected — but they must come along so the included nested Macro doesn't orphan them).
      const queue: NodeId[] = []
      for (const n of [...interfaceMembers, ...hidden]) {
        if (isMacro(n)) for (const m of macroMembers(n)) queue.push(m)
      }
      while (queue.length) {
        const nid = queue.shift()!
        if (seen.has(String(nid))) continue
        seen.add(String(nid))
        const n = this.graph.getNode(nid)
        if (!n || isTemplateBoundary(n)) continue
        hidden.push(n as Node)
        if (isMacro(n)) for (const m of macroMembers(n as Node)) queue.push(m)
      }
      instanceId = this.#extractTemplateFromMembers(interfaceMembers, title ?? 'Template', hidden)
    })
    return instanceId
  }

  /** Mint a fresh `$templateInstance` node for a definition (pins materialised from its interface). */
  #instantiateTemplateInstance(defId: TemplateDefId, worldPos: { x: number; y: number }): Node | null {
    const def = this.#definitions.get(defId)
    if (!def) return null
    const { pins, pinBoundary } = materializeInterface(templateInterface(def), createPinId)
    return { id: createNodeId(), type: TEMPLATE_INSTANCE_TYPE, position: { ...worldPos }, state: { definitionId: defId, pinBoundary }, pins }
  }

  /** Insert a fresh instance of a template definition (the palette/insertNode path for a `$template…`
   *  type). Refused if it would create a cycle (instancing the definition we're currently inside, or
   *  one that transitively contains it). */
  #insertTemplateInstance(defId: TemplateDefId, worldPos: { x: number; y: number }, opts: { center?: boolean }): Node | null {
    if (this.#wouldRecurse(defId)) return null
    const node = this.#instantiateTemplateInstance(defId, worldPos)
    if (!node) return null
    const render: RenderNodeOptions = { category: 'macro', title: this.#definitions.get(defId)!.title }
    if (opts.center) {
      this.#ensureSize(node, render)
      node.position = { x: worldPos.x - node.size!.x / 2, y: worldPos.y - node.size!.y / 2 }
    }
    this.#renderOpts.set(node.id, render)
    this.commandBus.apply(new AddNode(node))
    this.selection.replaceWith([node.id])
    return node
  }

  /** Dive depth — 0 at the root document, 1+ while editing nested template definitions. */
  get diveDepth(): number { return this.#diveStack.length }

  /** The definitions on the current dive branch — the one being edited plus every ancestor. Inserting
   *  (or diving into) any of these would create a recursive cycle, so they're refused and hidden from
   *  the palette. Read straight from the dive stack so it's correct even before the active definition
   *  is flushed back into #definitions. */
  #diveChainDefs(): ReadonlySet<TemplateDefId> {
    const chain = new Set<TemplateDefId>()
    if (this.#currentDefId !== null) chain.add(this.#currentDefId)
    for (const f of this.#diveStack) if (f.defId !== null) chain.add(f.defId)
    return chain
  }

  /** Would inserting an instance of `defId` here create a cycle? True for any definition on the
   *  current dive branch, or one that (already) transitively contains the definition we're inside. */
  #wouldRecurse(defId: TemplateDefId): boolean {
    if (this.#currentDefId === null) return false
    return this.#diveChainDefs().has(defId) || templateDefContains(this.#definitions, defId, this.#currentDefId)
  }

  /** Enter a `$templateInstance`'s shared definition: the canvas swaps to render the definition's
   *  own graph (members + boundary nodes) on a per-level command bus, so edits land in the definition
   *  and the root is untouched until `diveOut`. Returns false if the node isn't an instance, its
   *  definition is missing, or entering would re-open a definition already in the dive chain. */
  diveInto(instanceId: NodeId): boolean {
    const inst = this.#displayGraph.getNode(instanceId)
    if (!inst || !isTemplateInstance(inst)) return false
    const defId = inst.state['definitionId'] as TemplateDefId | undefined
    if (defId === undefined) return false
    const def = this.#definitions.get(defId)
    if (!def) return false
    // No re-entry: refuse a definition already open in the chain, or one that transitively contains
    // the definition we're currently inside (defensive — construction already prevents cycles).
    if (defId === this.#currentDefId || this.#diveStack.some((f) => f.defId === defId)) return false
    if (this.#currentDefId !== null && templateDefContains(this.#definitions, defId, this.#currentDefId)) return false

    this.#diveStack.push({
      graph: this.#displayGraph, bus: this.#displayBus,
      selectionIds: this.selection.ids().slice() as NodeId[],
      viewport: this.#viewport.state, defId: this.#currentDefId,
    })

    // A live graph + per-level bus for the definition. Sharing #coreEvents keeps the command→sync
    // bridge firing against the now-displayed definition graph.
    const g = new Graph()
    for (const n of def.nodes) g._addNode(n)
    for (const e of def.edges) g._addEdge(e)
    const bus = new CommandBus({ graph: g, events: this.#coreEvents })

    this.#teardownDisplay()
    this.selection.clear()
    this.#displayGraph = g
    this.#displayBus = bus
    this.#currentDefId = defId
    this.#rebuildDisplay()
    this.fitView()
    this.#updateBreadcrumb()
    this.#events.emit('dive:changed', { depth: this.diveDepth, definitionId: String(defId) })
    return true
  }

  /** Pop out of one or more template definitions. `toDepth` is the dive depth to return to (default:
   *  one level up; 0 returns all the way to the root document). Flushes each edited definition back
   *  into its stored data and re-syncs the affected instances' pins on the parent. */
  diveOut(toDepth = this.diveDepth - 1): void {
    if (this.#diveStack.length === 0) return
    const target = Math.max(0, Math.min(toDepth, this.#diveStack.length - 1))
    while (this.#diveStack.length > target) {
      // Resolve wildcard/boundary types on the definition NOW (the per-edit sync is deferred to a
      // microtask that may not have run yet), so the flush captures concrete boundary pin types and
      // the instance pins below pick them up.
      this.#propagateRerouteTypes()
      this.#flushActiveDefinition()
      const leftDefId = this.#currentDefId
      const frame = this.#diveStack.pop()!
      this.#teardownDisplay()
      this.selection.clear()
      this.#displayGraph = frame.graph
      this.#displayBus = frame.bus
      this.#currentDefId = frame.defId
      if (leftDefId !== null) this.#resyncInstancePins(leftDefId)
      this.#rebuildDisplay()
      this.selection.replaceWith(frame.selectionIds)
      this.#viewport.setState(frame.viewport)
    }
    this.#updateBreadcrumb()
    this.#events.emit('dive:changed', { depth: this.diveDepth, definitionId: this.#currentDefId !== null ? String(this.#currentDefId) : null })
    this.#requestRender()
  }

  /** Write the currently displayed definition's live graph back into its stored `TemplateDefinition`
   *  (so serialization + a later dive see the edits). No-op at the root. */
  #flushActiveDefinition(): void {
    if (this.#currentDefId === null) return
    const def = this.#definitions.get(this.#currentDefId)
    if (!def) return
    def.nodes = Array.from(this.#displayGraph.nodes()) as Node[]
    def.edges = Array.from(this.#displayGraph.edges()) as Edge[]
  }

  /** Re-derive a definition's interface and update every live instance of it (on the displayed graph)
   *  to match — preserving pin ids for boundary slots that still exist, and pruning edges that
   *  referenced a now-removed instance pin. Run on dive-out, after the parent graph is restored. */
  #resyncInstancePins(defId: TemplateDefId): void {
    const def = this.#definitions.get(defId)
    if (!def) return
    // The interface may have changed (added/renamed boundary nodes) — keep the palette schema current.
    this.#registerTemplateSchema(defId)
    const iface = templateInterface(def)
    for (const node of Array.from(this.#displayGraph.nodes()) as Node[]) {
      if (!isTemplateInstance(node) || node.state['definitionId'] !== defId) continue
      const prevMap = (node.state['pinBoundary'] ?? {}) as Record<string, string>
      const boundaryToPin = new Map<string, string>()
      for (const [pinId, b] of Object.entries(prevMap)) boundaryToPin.set(b, pinId)
      const pins: Pin[] = []
      const pinBoundary: Record<string, string> = {}
      const keptPinIds = new Set<string>()
      for (const slot of iface) {
        const id = (boundaryToPin.get(String(slot.boundary)) ?? String(createPinId())) as PinId
        keptPinIds.add(String(id))
        pins.push({ id, kind: 'data', direction: slot.direction, type: slot.type, multiple: slot.direction === 'out', ...(slot.label !== undefined ? { label: slot.label } : {}) })
        pinBoundary[String(id)] = String(slot.boundary)
      }
      // Drop parent-graph edges that referenced an instance pin the interface no longer has.
      for (const e of Array.from(this.#displayGraph.edges())) {
        const stale = (e.from.node === node.id && !keptPinIds.has(String(e.from.pin))) || (e.to.node === node.id && !keptPinIds.has(String(e.to.pin)))
        if (stale) this.#displayGraph._removeEdge(e.id)
      }
      node.pins = pins
      node.state['pinBoundary'] = pinBoundary
      // Pins changed (added/renamed/removed) → drop the stale size so the next view build refits the
      // box to the new labels. diveOut's #rebuildDisplay re-ensures the view + size right after.
      delete (node as { size?: unknown }).size
    }
  }

  /** Render (or remove) the dive breadcrumb in the overlay root: Root / DefTitle / … — each segment
   *  pops to that depth. Hidden at the root document. */
  #updateBreadcrumb(): void {
    if (this.diveDepth === 0 || this.#breadcrumbDisabled || this.#liveMode) {
      this.#breadcrumbEl?.remove()
      this.#breadcrumbEl = null
      return
    }
    if (!this.#breadcrumbEl) {
      const el = document.createElement('div')
      el.setAttribute('data-xeno-breadcrumb', '')
      Object.assign(el.style, {
        position: 'absolute', top: '12px', left: '12px', display: 'flex', gap: '4px', alignItems: 'center',
        pointerEvents: 'auto', font: '500 12px var(--xeno-font, system-ui, sans-serif)',
        color: 'var(--xeno-text, #e8e8e8)', background: 'var(--xeno-panel, rgba(20,22,18,0.82))',
        border: '1px solid var(--xeno-border, rgba(255,255,255,0.12))', borderRadius: 'var(--xeno-radius, 8px)',
        padding: '4px 8px', backdropFilter: 'blur(8px)', zIndex: '20',
      })
      this.overlayRoot.appendChild(el)
      this.#breadcrumbEl = el
    }
    // Trail of displayed definitions from root to current = saved frames' defIds + the current one.
    const trail = [...this.#diveStack.map((f) => f.defId), this.#currentDefId]
    this.#breadcrumbEl.replaceChildren()
    trail.forEach((defId, i) => {
      if (i > 0) {
        const sep = document.createElement('span')
        sep.textContent = '›'; sep.style.opacity = '0.5'
        this.#breadcrumbEl!.appendChild(sep)
      }
      const label = defId === null ? 'Root' : (this.#definitions.get(defId)?.title ?? 'Template')
      const isCurrent = i === trail.length - 1
      const seg = document.createElement('button')
      seg.textContent = label
      Object.assign(seg.style, {
        all: 'unset', cursor: isCurrent ? 'default' : 'pointer', padding: '0 2px',
        opacity: isCurrent ? '1' : '0.75', fontWeight: isCurrent ? '700' : '500',
      })
      if (!isCurrent) seg.addEventListener('click', () => this.diveOut(i))
      this.#breadcrumbEl!.appendChild(seg)
    })
  }

  /** Expand a collapsed macro: re-point each proxy edge from the macro pin back to the member pin and
   *  reveal members, with a brief grow-in animation. Idempotent. */
  expandMacro(id: NodeId): void {
    const m = this.graph.getNode(id)
    if (!m || !isMacro(m) || !m.state['collapsed']) return
    // Only one open macro per nesting line: collapse any expanded macro that isn't an ancestor of the
    // one being opened (so opening a macro inside another keeps the chain, but opening a sibling closes
    // the previously-open one). Collapse deepest-first to unwind cleanly.
    const stale = [...this.graph.nodes()]
      .filter((n) => isMacro(n) && !n.state['collapsed'] && n.id !== id && !this.#macroIsAncestor(n.id, id))
      .sort((a, b) => this.#macroDepthOf(b.id) - this.#macroDepthOf(a.id))
    for (const n of stale) this.#setMacroCollapsed(n.id, true)
    // Flag BEFORE the model flip so the resulting sync (which materialises the member + frame views)
    // primes them invisible — otherwise they paint one full frame before the grow-in resets them.
    this.#expandingMacros.add(id)
    this.#setMacroCollapsed(id, false)
    this.#tweenViewportToMacroIfNeeded(id)
    this.#animateMacroExpand(id)
  }

  /** If the expanded macro's member bbox doesn't sit comfortably inside the current viewport,
   *  animate the camera (pan + zoom) to fit it. Mirrors fitView() math but tweens through it
   *  instead of snapping, so the unfold reads as a continuous gesture. No-op when already in view. */
  #tweenViewportToMacroIfNeeded(id: NodeId): void {
    const macro = this.graph.getNode(id)
    if (!macro || !isMacro(macro)) return
    const memberIds = macroMembers(macro as Node)
    if (memberIds.length === 0) return
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let counted = 0
    for (const mid of memberIds) {
      const n = this.graph.getNode(mid)
      if (!n) continue
      const b = nodeBounds(n as Node, this.#theme.tokens)
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y)
      maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height)
      counted++
    }
    if (counted === 0) return
    const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    const screen = { width: Math.max(1, this.#app.screen.width), height: Math.max(1, this.#app.screen.height) }
    const cur = this.#viewport.state
    const edgeMargin = 32
    const tl = worldToScreen({ x: bounds.x, y: bounds.y }, cur)
    const br = worldToScreen({ x: bounds.x + bounds.width, y: bounds.y + bounds.height }, cur)
    const fitsCurrent =
      tl.x >= edgeMargin && tl.y >= edgeMargin &&
      br.x <= screen.width - edgeMargin && br.y <= screen.height - edgeMargin
    if (fitsCurrent) return
    const target = fitView(
      bounds, screen,
      { padding: 80, maxZoom: Math.max(cur.zoom, 1), minZoom: this.#zoomBounds[0] },
    )
    this.#tweenViewport(target, 260)
  }

  #viewportTweenRaf: number | null = null
  #tweenViewport(target: ViewportState, durationMs: number): void {
    if (this.#viewportTweenRaf !== null) { cancelAnimationFrame(this.#viewportTweenRaf); this.#viewportTweenRaf = null }
    const from = { ...this.#viewport.state }
    const start = performance.now()
    const tick = (): void => {
      const raw = Math.min(1, (performance.now() - start) / durationMs)
      const e = 1 - Math.pow(1 - raw, 3) // ease-out cubic — matches the macro grow-in
      this.#viewport.setState({
        x: from.x + (target.x - from.x) * e,
        y: from.y + (target.y - from.y) * e,
        zoom: from.zoom + (target.zoom - from.zoom) * e,
      })
      if (raw < 1) this.#viewportTweenRaf = requestAnimationFrame(tick)
      else { this.#viewportTweenRaf = null; this.#viewport.setState(target) }
    }
    this.#viewportTweenRaf = requestAnimationFrame(tick)
  }
  /** Re-collapse an expanded macro, animating the group shrinking back into the node first. */
  collapseMacro(id: NodeId): void {
    const m = this.graph.getNode(id)
    if (!m || !isMacro(m) || m.state['collapsed']) return
    this.#animateMacroCollapse(id, () => this.#setMacroCollapsed(id, true))
  }

  /** Shrink-out: members + frame collapse toward the macro centre (mirror of the expand grow-in),
   *  then `onDone` flips the model to collapsed. */
  #animateMacroCollapse(id: NodeId, onDone: () => void): void {
    const macro = this.graph.getNode(id)
    if (!macro) { onDone(); return }
    const cx = macro.position.x + (macro.size?.x ?? 0) / 2
    const cy = macro.position.y + (macro.size?.y ?? 0) / 2
    const members = macroMembers(macro as Node).map((mid) => this.#views.get(mid)).filter((v): v is NodeView => !!v)
    const frame = this.#macroFrames.get(id)
    const targets: Container[] = [...members.map((v) => v.container), ...(frame ? [frame.container] : [])]
    if (targets.length === 0) { onDone(); return }
    const origin = new Map<Container, { x: number; y: number }>()
    for (const t of targets) origin.set(t, { x: t.position.x, y: t.position.y })
    const start = performance.now(), dur = 160
    const tick = (): void => {
      const raw = Math.min(1, (performance.now() - start) / dur)
      const e = raw * raw // ease-in
      for (const t of targets) {
        const o = origin.get(t)!
        t.alpha = 1 - e
        t.scale.set(1 - 0.4 * e)
        t.position.set(cx + (o.x - cx) * (1 - e), cy + (o.y - cy) * (1 - e))
      }
      this.#requestRender()
      if (raw < 1) requestAnimationFrame(tick)
      else { for (const t of targets) { const o = origin.get(t)!; t.alpha = 1; t.scale.set(1); t.position.set(o.x, o.y) } onDone() }
    }
    tick()
  }

  /** Grow-in: after the model expands, fade + scale the revealed members and frame up from the macro
   *  node's centre, so a double-click visibly "unfolds" the group rather than snapping. */
  #animateMacroExpand(id: NodeId): void {
    const macro = this.graph.getNode(id)
    if (!macro) return
    const cx = macro.position.x + (macro.size?.x ?? 0) / 2
    const cy = macro.position.y + (macro.size?.y ?? 0) / 2
    // Defer one frame so #syncFromGraph has materialised the member views + the frame (primed invisible).
    requestAnimationFrame(() => {
      this.#expandingMacros.delete(id) // priming done its job; from here the animation owns alpha
      const members = macroMembers(macro as Node).map((mid) => this.#views.get(mid)).filter((v): v is NodeView => !!v)
      const frame = this.#macroFrames.get(id)
      const targets: Container[] = [...members.map((v) => v.container), ...(frame ? [frame.container] : [])]
      if (targets.length === 0) return
      const origin = new Map<Container, { x: number; y: number }>()
      for (const t of targets) origin.set(t, { x: t.position.x, y: t.position.y })
      const start = performance.now(), dur = 200
      const tick = (): void => {
        const raw = Math.min(1, (performance.now() - start) / dur)
        const e = 1 - Math.pow(1 - raw, 3) // ease-out cubic
        for (const t of targets) {
          const o = origin.get(t)!
          const s = 0.6 + 0.4 * e
          t.alpha = e
          // lerp position from the macro centre toward its real spot, scaled in.
          t.position.set(cx + (o.x - cx) * e, cy + (o.y - cy) * e)
          t.scale.set(s)
        }
        this.#requestRender()
        if (raw < 1) requestAnimationFrame(tick)
        else for (const t of targets) { const o = origin.get(t)!; t.alpha = 1; t.scale.set(1); t.position.set(o.x, o.y) }
      }
      tick()
    })
  }
  toggleMacro(id: NodeId): void {
    const m = this.graph.getNode(id)
    if (!m || !isMacro(m)) return
    if (m.state['collapsed']) this.expandMacro(id) // animated
    else this.collapseMacro(id)
  }

  /** Materialise declarative collapsed macros loaded from JSON: derive proxy pins + rewire boundary
   *  edges, deepest-nested first so an inner macro is already a collapsed node (with pins) before an
   *  outer macro computes its own boundary. Operates on pure model state (called before views exist). */
  #materializeLoadedMacros(): void {
    const macros = [...this.graph.nodes()].filter(
      (n) => isMacro(n) && n.state['collapsed'] && (n.pins?.length ?? 0) === 0,
    ) as Node[]
    if (macros.length === 0) return
    const parentOf = (nid: NodeId): Node | undefined => {
      for (const n of this.graph.nodes()) if (isMacro(n) && macroMembers(n as Node).includes(nid)) return n as Node
      return undefined
    }
    const depthOf = (id: NodeId): number => { let d = 0, p = parentOf(id); while (p) { d++; p = parentOf(p.id) } return d }
    macros.sort((a, b) => depthOf(b.id) - depthOf(a.id)) // deepest first
    for (const macro of macros) {
      const members = macroMembers(macro)
      if (members.length === 0) continue
      const edges = [...this.graph.edges()] as Edge[]
      // Same widget-pin lift as `createMacroFromSelection` — keep both paths consistent so a macro
      // built via group-from-selection and one rebuilt here (template extraction etc.) have the
      // same pin surface for the same members.
      const incomingByPin = new Set<string>()
      for (const e of edges) incomingByPin.add(String(e.to.pin))
      const liftPins: { node: NodeId; pin: PinId }[] = []
      for (const id of members) {
        const n = this.graph.getNode(id) as Node | undefined
        if (!n) continue
        for (const lift of disconnectedWidgetBoundPins(n, (pid) => incomingByPin.has(String(pid)))) liftPins.push(lift)
      }
      const plan = planMacroCollapse(macro.id, members, edges, (n, p) => this.#pinInfo(n, p), { pin: createPinId, edge: createEdgeId }, { liftPins })
      macro.pins = plan.pins
      macro.state['proxyMap'] = plan.proxyMap as unknown
      // Size was measured with the (then empty) pin list — recompute now that proxy pins exist, else
      // the pins overflow a too-short node body.
      delete (macro as { size?: unknown }).size
      this.#ensureSize(macro, this.#renderOpts.get(macro.id) ?? {})
      for (const eid of plan.disconnect) this.graph._removeEdge(eid)
      for (const e of plan.connect) this.graph._addEdge(e)
    }
  }

  #pinInfo(node: NodeId, pin: PinId): { type: string; label?: string } {
    const n = this.graph.getNode(node)
    const p = n?.pins.find((pp) => String(pp.id) === String(pin))
    return { type: String(p?.type ?? 'any'), ...(p?.label !== undefined ? { label: p.label } : {}) }
  }

  #findEdge(from: { node: NodeId; pin: PinId }, to: { node: NodeId; pin: PinId }): Edge | undefined {
    for (const e of this.graph.edges()) {
      if (e.from.node === from.node && String(e.from.pin) === String(from.pin) &&
          e.to.node === to.node && String(e.to.pin) === String(to.pin)) return e as Edge
    }
    return undefined
  }

  /** Toggle a macro between collapsed (edges on the macro proxy pins) and expanded (edges back on the
   *  member pins). Pins are fixed for the macro's lifetime — we only re-point the boundary edges. */
  #setMacroCollapsed(id: NodeId, collapsed: boolean): void {
    const macro = this.graph.getNode(id)
    if (!macro || !isMacro(macro) || !!macro.state['collapsed'] === collapsed) return
    const proxyMap = (macro.state['proxyMap'] ?? []) as MacroProxyRecord[]
    this.commandBus.transaction(() => {
      for (const r of proxyMap) {
        const mem = { node: r.memberNode, pin: r.memberPin }
        const macroEnd = { node: id, pin: r.macroPin }
        const nextEnd = collapsed ? macroEnd : mem
        const prevEnd = collapsed ? mem : macroEnd
        // RESOLVE THE EXTERNAL ENDPOINT FROM THE CURRENT EDGE, NOT FROM THE PROXY-MAP SNAPSHOT.
        // The snapshot `r.externalNode/Pin` was recorded at macro-creation time; if the external
        // node was later wrapped into a template (or any other rewiring touched it), the snapshot
        // is stale and findEdge against it returns null → we'd create a phantom edge to a node
        // that no longer exists in the graph. Instead, look up the current edge by prevEnd alone.
        let cur: Edge | undefined
        for (const e of this.graph.edges()) {
          const ee = e as Edge
          if (r.direction === 'in') {
            if (ee.to.node === prevEnd.node && String(ee.to.pin) === String(prevEnd.pin)) { cur = ee; break }
          } else {
            if (ee.from.node === prevEnd.node && String(ee.from.pin) === String(prevEnd.pin)) { cur = ee; break }
          }
        }
        if (!cur) continue
        const currentExt = r.direction === 'in' ? cur.from : cur.to
        this.commandBus.apply(new DisconnectEdge(cur.id))
        const next: Edge = r.direction === 'in'
          ? { id: createEdgeId(), from: currentExt, to: nextEnd }
          : { id: createEdgeId(), from: nextEnd, to: currentExt }
        this.commandBus.apply(new ConnectPins(next))
      }
      this.commandBus.apply(new SetNodeState(id, { collapsed }))
    })
  }

  /** Hide member views/edges of collapsed macros, and hide the macro node itself while EXPANDED (a
   *  themed frame stands in for it). Called after each graph sync; cheap (touches only live views). */
  #applyMacroVisibility(): void {
    const hidden = new Set<NodeId>()
    const expandedMacros = new Set<NodeId>()
    for (const n of this.graph.nodes()) {
      if (!isMacro(n)) continue
      if (n.state['collapsed']) for (const m of macroMembers(n as Node)) hidden.add(m)
      else expandedMacros.add(n.id)
    }
    this.#hiddenMembers = hidden
    for (const [nid, view] of this.#views) view.container.visible = !hidden.has(nid) && !expandedMacros.has(nid)
    for (const [eid, rec] of this.#edgeRecords) {
      const e = this.graph.getEdge(eid)
      rec.graphics.visible = !(e !== undefined && (hidden.has(e.from.node) || hidden.has(e.to.node)))
    }
    this.#syncMacroFrames(expandedMacros)
    this.#reparentMacros()
    // Prime freshly-expanding macros invisible (members + frame) so #animateMacroExpand fades them in
    // from nothing — runs in the sync microtask, i.e. before the first paint, so there's no flash.
    for (const eid of this.#expandingMacros) {
      const macro = this.graph.getNode(eid)
      if (!macro) continue
      for (const mid of macroMembers(macro as Node)) { const v = this.#views.get(mid); if (v) v.container.alpha = 0 }
      const f = this.#macroFrames.get(eid); if (f) f.container.alpha = 0
    }
  }

  /** Keep macro z-order correct: an EXPANDED macro's frame + members reparent into #macroOverlayLayer
   *  (above all ordinary nodes) so the whole group reads as one thing on top; a COLLAPSED macro's node
   *  rises to the top of #nodesLayer. Nested macros stack by depth (deeper → on top). */
  /** Member → owning macro index. Rebuilt lazily; invalidated whenever the graph mutates (add/
   *  remove node, SetNodeState — covers `state.members` edits). Without this, every macro lookup
   *  was O(N) → `#reparentMacros` ran O(M·N) per sync, which is what melts 37k-node paste. */
  #macroParentIndex: Map<NodeId, NodeId> | null = null
  #invalidateMacroIndex(): void { this.#macroParentIndex = null }
  #rebuildMacroIndex(): Map<NodeId, NodeId> {
    const idx = new Map<NodeId, NodeId>()
    for (const n of this.graph.nodes()) {
      if (!isMacro(n)) continue
      for (const m of macroMembers(n as Node)) idx.set(m, n.id as NodeId)
    }
    this.#macroParentIndex = idx
    return idx
  }
  #ensureMacroIndex(): Map<NodeId, NodeId> { return this.#macroParentIndex ?? this.#rebuildMacroIndex() }

  /** The macro whose member list contains `nid` (its immediate container), or undefined. O(1). */
  #macroParentOf(nid: NodeId): Node | undefined {
    const idx = this.#ensureMacroIndex()
    const pid = idx.get(nid)
    return pid !== undefined ? (this.graph.getNode(pid) as Node | undefined) : undefined
  }
  /** Nesting depth of a node (how many macros transitively contain it). O(depth). */
  #macroDepthOf(id: NodeId): number {
    const idx = this.#ensureMacroIndex()
    let d = 0, p: NodeId | undefined = idx.get(id)
    while (p !== undefined) { d++; p = idx.get(p) }
    return d
  }
  /** Is `ancestor` a (transitive) container of `id`? O(depth). */
  #macroIsAncestor(ancestor: NodeId, id: NodeId): boolean {
    const idx = this.#ensureMacroIndex()
    let p: NodeId | undefined = idx.get(id)
    while (p !== undefined) { if (p === ancestor) return true; p = idx.get(p) }
    return false
  }
  /** Deepest currently-expanded macro (the innermost open one) — what a click-outside collapses first. */
  #deepestExpandedMacro(): NodeId | null {
    let best: NodeId | null = null, bestD = -1
    for (const n of this.graph.nodes()) {
      if (!isMacro(n) || n.state['collapsed']) continue
      const d = this.#macroDepthOf(n.id)
      if (d > bestD) { bestD = d; best = n.id }
    }
    return best
  }

  #reparentMacros(): void {
    const depthOf = (id: NodeId): number => this.#macroDepthOf(id)

    const overlayMembers = new Map<NodeId, number>() // member id → owner macro depth
    const overlayFrames: { id: NodeId; depth: number }[] = []
    const collapsedMacros: { id: NodeId; depth: number }[] = []
    for (const n of this.graph.nodes()) {
      if (!isMacro(n)) continue
      const depth = depthOf(n.id)
      if (n.state['collapsed']) collapsedMacros.push({ id: n.id, depth })
      else {
        for (const mid of macroMembers(n as Node)) overlayMembers.set(mid, depth)
        overlayFrames.push({ id: n.id, depth })
      }
    }
    // Reparent node views: expanded-macro members → overlay, everything else → the node layer.
    for (const [nid, view] of this.#views) {
      const target = overlayMembers.has(nid) ? this.#macroOverlayLayer : this.#nodesLayer
      if (view.container.parent !== target) target.addChild(view.container)
    }
    // Expanded frames → overlay too (collapsed/removed frames stay/are gone in #macroFramesLayer).
    for (const f of overlayFrames) {
      const fr = this.#macroFrames.get(f.id)
      if (fr && fr.container.parent !== this.#macroOverlayLayer) this.#macroOverlayLayer.addChild(fr.container)
    }
    // Any edge incident to an overlay member → overlay (so its whole length, including the stub from
    // the frame edge to the inlet pin, draws inside the expanded macro above the frame). Boundary
    // edges (one end external) ride over the scene briefly — acceptable for a thin wire.
    const overlayEdges: Container[] = []
    for (const [eid, rec] of this.#edgeRecords) {
      const e = this.graph.getEdge(eid)
      const inside = !!e && (overlayMembers.has(e.from.node) || overlayMembers.has(e.to.node))
      const target = inside ? this.#macroOverlayLayer : this.#edgesLayer
      if (rec.graphics.parent !== target) target.addChild(rec.graphics)
      if (inside) overlayEdges.push(rec.graphics)
    }
    // Order inside the overlay: frames (backgrounds) → member wires → member nodes; deeper on top.
    const order: Container[] = []
    overlayFrames.sort((a, b) => a.depth - b.depth)
    for (const f of overlayFrames) { const fr = this.#macroFrames.get(f.id); if (fr) order.push(fr.container) }
    order.push(...overlayEdges)
    const members = [...overlayMembers].sort((a, b) => a[1] - b[1])
    for (const [mid] of members) { const v = this.#views.get(mid); if (v) order.push(v.container) }
    order.forEach((c, i) => this.#macroOverlayLayer.setChildIndex(c, i))
    // Collapsed macro nodes rise above ordinary nodes (shallowest first → deepest on top).
    collapsedMacros.sort((a, b) => a.depth - b.depth)
    for (const m of collapsedMacros) {
      const v = this.#views.get(m.id)
      if (v?.container.visible && v.container.parent === this.#nodesLayer) {
        this.#nodesLayer.setChildIndex(v.container, this.#nodesLayer.children.length - 1)
      }
    }
  }

  /** Reconcile expanded-macro frame views: a themed rectangle behind each expanded macro's members,
   *  sized to their bounds. Double-click the header to collapse. */
  /** World-space rect of an expanded macro's frame (members bounds + padding + header strip). */
  #macroFrameRect(id: NodeId): { x: number; y: number; width: number; height: number } | null {
    const macro = this.graph.getNode(id)
    if (!macro) return null
    const members = macroMembers(macro as Node).map((m) => this.graph.getNode(m)).filter((n): n is Node => !!n)
    if (members.length === 0) return null
    const pad = 18, headerH = this.#theme.tokens.geometry.comment.headerHeight
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const m of members) {
      const b = nodeBounds(m, this.#theme.tokens)
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y)
      maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height)
    }
    return { x: minX - pad, y: minY - pad - headerH, width: (maxX - minX) + pad * 2, height: (maxY - minY) + pad * 2 + headerH }
  }

  #syncMacroFrames(expandedMacros: ReadonlySet<NodeId>): void {
    for (const id of expandedMacros) {
      const rect = this.#macroFrameRect(id)
      if (!rect) continue
      let frame = this.#macroFrames.get(id)
      if (!frame) {
        frame = renderMacroFrame(this.#theme.tokens, this.#theme.commentHeaderStyle ?? 'gradient')
        this.#macroFramesLayer.addChild(frame.container)
        this.#wireMacroFrame(id, frame)
        this.#macroFrames.set(id, frame)
      }
      frame.update(rect, this.#renderOpts.get(id)?.title ?? 'Macro')
    }
    for (const [id, frame] of [...this.#macroFrames]) {
      if (!expandedMacros.has(id)) { frame.destroy(); this.#macroFrames.delete(id) }
    }
  }

  #macroFrameLastTap = 0
  #wireMacroFrame(id: NodeId, frame: MacroFrameView): void {
    // Click in THIS frame's body, outside a deeper open child macro → collapse the child (one level
    // per click). So clicking the parent group's empty body closes the sub-group nested inside it.
    frame.body.on('pointerdown', (e: FederatedPointerEvent) => {
      if (e.button !== 0 || !this.#interactive) return
      const deepest = this.#deepestExpandedMacro()
      if (deepest && deepest !== id && this.#macroIsAncestor(id, deepest)) {
        this.collapseMacro(deepest)
        e.stopPropagation()
      }
    })
    frame.header.on('pointerover', () => { frame.setState('hover'); this.#requestRender() })
    frame.header.on('pointerout', () => { frame.setState('default'); this.#requestRender() })
    frame.header.on('pointerdown', (e: FederatedPointerEvent) => {
      if (e.button !== 0 || !this.#interactive) return
      e.stopPropagation()
      const now = performance.now()
      // Double-click the header to rename (collapse is via click-outside). Like a comment header.
      if (now - this.#macroFrameLastTap < 320) { this.#macroFrameLastTap = 0; requestAnimationFrame(() => this.#editMacroTitle(id)); return }
      this.#macroFrameLastTap = now
    })
  }

  /** Inline-rename an expanded macro via the same transparent overlay the comment header uses — the
   *  live glyphs are the frame's WebGL title, so no jump. Commits to the macro's render title. */
  #editMacroTitle(id: NodeId): void {
    const frame = this.#macroFrames.get(id)
    const rect = this.#macroFrameRect(id)
    if (!frame || !rect) return
    const vp = this.#viewport.state
    const t = this.#theme.tokens, ct = t.typography.comment
    const headerH = t.geometry.comment.headerHeight
    const current = this.#renderOpts.get(id)?.title ?? 'Macro'
    this.#ensureWidgetOverlay().editText({
      rect: { x: rect.x * vp.zoom + vp.x + 2 * vp.zoom, y: rect.y * vp.zoom + vp.y + 2 * vp.zoom, width: rect.width * vp.zoom - 4 * vp.zoom, height: headerH * vp.zoom - 4 * vp.zoom },
      value: current,
      style: {
        background: 'transparent', text: 'transparent', border: 'transparent', borderWidth: 0, radius: 0,
        paddingX: 8 * vp.zoom, paddingY: 2 * vp.zoom, fontSize: ct.size * vp.zoom,
        fontFamily: t.typography.fontFamily, fontWeight: '700', placeholder: '', selection: 'transparent',
      },
      caretColor: ct.color, selectAll: false, autoGrow: true,
      onInput: (text) => { this.#macroFrames.get(id)?.update(this.#macroFrameRect(id) ?? rect, text); this.#requestRender() },
      onCommit: (text) => {
        const r = this.#renderOpts.get(id) ?? {}; r.title = text; this.#renderOpts.set(id, r)
        // Rebuild the collapsed node view so the renamed title shows when collapsed too.
        const v = this.#views.get(id)
        if (v) { v.container.destroy({ children: true }); this.#views.delete(id) }
        const node = this.graph.getNode(id)
        if (node) this.#ensureView(node as Node)
        this.#applyMacroVisibility()
        this.#requestRender()
      },
    })
  }

  /** Inline-rename a node's title (header). For a `$templateInstance` this renames its definition
   *  (propagates to all instances + palette); for a `$templateInput`/`$templateOutput` boundary it
   *  also relabels the single interface pin so the rename flows to instance pins on dive-out; for any
   *  other node it just sets the displayed title. */
  #editNodeTitle(id: NodeId): void {
    const node = this.graph.getNode(id)
    const view = this.#views.get(id)
    if (!node || !view || !node.size) return
    const vp = this.#viewport.state
    const t = this.#theme.tokens
    const headerH = t.geometry.node.headerHeight
    const heading = t.typography.heading
    // Exact title-glyph inset (mirrors node-renderer) so the DOM caret lands on the WebGL title — no
    // jump on enter.
    const chevron = t.geometry.header.chevronSize
    const titleStartX = t.geometry.node.headerPadding + 8 + chevron / 2 - 4 + chevron / 2 + t.geometry.header.titleGap
    const original = this.#renderOpts.get(id)?.title ?? node.type
    let committed = false
    // Comment-rename mechanic: the DOM field's TEXT is transparent — the visible glyphs are the LIVE
    // WebGL title (updated per keystroke, un-ellipsised via fullTitle), so zero font/position jump;
    // only the caret shows. autoGrow lets the field + caret run past the node.
    this.#renderNodeTitleLive(id, original, true)
    this.#ensureWidgetOverlay().editText({
      rect: {
        x: node.position.x * vp.zoom + vp.x + titleStartX * vp.zoom,
        y: node.position.y * vp.zoom + vp.y + 2 * vp.zoom,
        width: Math.max(40, node.size.x - titleStartX - 8) * vp.zoom,
        height: (headerH - 4) * vp.zoom,
      },
      value: original,
      style: {
        background: 'transparent', text: 'transparent', border: 'transparent', borderWidth: 0, radius: 0,
        paddingX: 0, paddingY: 0, fontSize: heading.size * vp.zoom,
        fontFamily: t.typography.fontFamily, fontWeight: '700', placeholder: '', selection: 'transparent',
      },
      caretColor: heading.color, selectAll: false, autoGrow: true,
      onInput: (text) => this.#renderNodeTitleLive(id, text, true),
      onCommit: (text) => { committed = true; const v = text.trim(); if (v !== '') this.#commitNodeRename(id, v); else { this.#renderNodeTitleLive(id, original, false); this.#resizeNodeView(id) } },
      onClose: () => { if (!committed) { this.#renderNodeTitleLive(id, original, false); this.#resizeNodeView(id) } },
    })
  }

  /** Set a node's displayed title (optionally un-ellipsised) and rebuild its view, no size recompute —
   *  drives the live preview during inline rename. */
  #renderNodeTitleLive(id: NodeId, title: string, full: boolean): void {
    const r = this.#renderOpts.get(id) ?? {}; r.title = title
    if (full) r.fullTitle = true; else delete r.fullTitle
    this.#renderOpts.set(id, r)
    const node = this.graph.getNode(id), v = this.#views.get(id)
    if (node && v) { v.container.destroy({ children: true }); this.#views.delete(id); this.#ensureView(node as Node) }
    this.#requestRender()
  }

  /** Recompute a node's natural size from its current title/pins/widgets and rebuild its view —
   *  call after a rename or an interface change so the box grows/shrinks to fit. */
  #resizeNodeView(id: NodeId): void {
    const node = this.graph.getNode(id)
    if (!node) return
    delete (node as { size?: unknown }).size
    this.#ensureSize(node as Node, this.#renderOpts.get(id) ?? {})
    const v = this.#views.get(id)
    if (v) { v.container.destroy({ children: true }); this.#views.delete(id) }
    this.#ensureView(node as Node)
    this.#requestRender()
  }

  #commitNodeRename(id: NodeId, text: string): void {
    const node = this.graph.getNode(id)
    if (!node) return
    // Drop the edit-only fullTitle flag so the committed title ellipsises normally again.
    const ro = this.#renderOpts.get(id); if (ro) delete ro.fullTitle
    if (isTemplateInstance(node)) {
      const defId = node.state['definitionId'] as TemplateDefId | undefined
      if (defId !== undefined) this.renameTemplate(defId, text)
      return
    }
    const r = this.#renderOpts.get(id) ?? {}; r.title = text; this.#renderOpts.set(id, r)
    // A boundary node's title doubles as its interface pin's label.
    if (isTemplateBoundary(node) && node.pins[0]) node.pins[0].label = text
    this.#resizeNodeView(id)
  }

  #nodeIntersects(node: Node, rect: GeomRect): boolean {
    return rectIntersects(nodeBounds(node, this.#theme.tokens), rect)
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
    this.#addEdgeToIndex(edge) // keep the index in sync, or the next cull would dispose this edge
    this.#edgeOpts.set(edge.id, opts) // so a later #cullEdges re-materialise keeps the wire's opts
    // Materialise now only at the full level and when (not virtualizing) or the edge touches a live
    // node; otherwise it's data + index and #cullEdges draws it when an endpoint scrolls in.
    const incident = this.#views.has(fromNode.id) || this.#views.has(toNode.id)
    if (this.#lodLevel === 'full' && (!this.#virtualizeActive() || incident)) this.#materializeEdge(edge, opts)
    // Direct-API connect bypasses the command bus (it isn't undoable), but listeners — including
    // the endpoint-resize hook that grows/shrinks pin-bound widgets — still need to know an edge
    // appeared. Drag-UI connect already fires this via the commandBus→events bridge.
    this.#events.emit('edge:connected', { edge })
    this.#requestRender()
    return edge.id
  }

  /** Move a node to an absolute world position (undoable). View reconciles on the next microtask via
   *  the command-bus sync. Used by the React controlled layer to reflect a `nodes` prop change. */
  moveNode(nodeId: NodeId, position: { x: number; y: number }): boolean {
    if (!this.graph.getNode(nodeId)) return false
    this.commandBus.apply(new MoveNode(nodeId, position))
    return true
  }

  /** Remove a node and its incident edges (undoable). Listeners on `node:removing` may veto
   *  via `payload.cancel()` — returns false in that case without touching the command bus. */
  removeNode(nodeId: NodeId): boolean {
    if (!this.graph.getNode(nodeId)) return false
    if (!firePreventable(this.#events, 'node:removing', { nodeId })) return false
    this.commandBus.apply(new RemoveNode(nodeId))
    return true
  }

  /** Add a pre-built edge, preserving its id and pin endpoints (undoable). Unlike `connect`, which
   *  mints a fresh edge id, this keeps the caller's id — needed by the controlled layer to mirror an
   *  `edges` prop without id drift. No-op if an edge with that id already exists. Listeners on
   *  `edge:connecting` may veto via `payload.cancel()`. */
  addEdge(edge: Edge): boolean {
    if (this.graph.getEdge(edge.id)) return false
    if (!firePreventable(this.#events, 'edge:connecting', { edge })) return false
    this.commandBus.apply(new ConnectPins(edge))
    return true
  }

  /** Disconnect an edge by id (undoable). Listeners on `edge:disconnecting` may veto. For destructive
   *  removal that also cleans up dangling inline reroutes left behind, use `deleteEdge`. */
  disconnectEdge(edgeId: EdgeId): boolean {
    if (!this.graph.getEdge(edgeId)) return false
    if (!firePreventable(this.#events, 'edge:disconnecting', { edgeId })) return false
    this.commandBus.apply(new DisconnectEdge(edgeId))
    return true
  }

  /** Replace the current selection with the given node ids (fires `selection:changed`). */
  setSelection(nodeIds: readonly NodeId[]): void {
    this.selection.replaceWith(nodeIds)
  }

  // ---- widgets ---------------------------------------------------------------------------------

  #widgetSpec(nodeId: NodeId, widgetId: string): { node: Node; spec: WidgetSpec } | null {
    const node = this.graph.getNode(nodeId)
    const spec = node?.widgets?.find((w) => w.id === widgetId)
    return node && spec ? { node, spec } : null
  }

  /** Register a custom widget controller. Either **canvas-draw** (fast, painted to a WebGL texture)
   *  or **DOM-mounted** (arbitrary HTML — the contract the React/Vue/Svelte adapters wrap). A
   *  `custom` widget's `renderer` field names the controller. */
  registerWidget(name: string, controller: CustomWidgetController): void {
    this.#widgetControllers.set(name, controller)
    this.#syncDomWidgets()
  }

  /** Provider that resolves the live runtime value flowing into a node's bound pin (typically
   *  registered by a runtime plugin such as `@xenolith/plugin-runtime`). A `'always'` (display)
   *  widget reads this when its bound pin is connected — that's how Output-style preview nodes
   *  show what's wired through them. Without a provider, display widgets fall back to state. */
  #pinLiveValueProvider: ((nodeId: NodeId, pinKey: string) => unknown) | null = null
  setPinLiveValueProvider(fn: ((nodeId: NodeId, pinKey: string) => unknown) | null): void {
    this.#pinLiveValueProvider = fn
    this.#requestRender()
  }
  #pinLiveValueFor(nodeId: NodeId): ((pinKey: string) => unknown) | undefined {
    const p = this.#pinLiveValueProvider
    if (!p) return undefined
    return (k) => p(nodeId, k)
  }

  // ---- DOM-mounted custom widgets --------------------------------------------------------------
  // A screen-space layer over the canvas hosts framework/HTML widgets; we keep each element synced
  // to its node's on-screen widget rect (pan/zoom/drag/collapse) every painted frame.
  #domLayer: HTMLDivElement | null = null
  readonly #domWidgets = new Map<string, { el: HTMLElement; controller: DomWidgetController; cleanup?: () => void; nodeId: NodeId; widgetId: string }>()

  #widgetLayoutTokens(): WidgetLayoutTokens {
    const g = this.#theme.tokens.geometry
    return {
      node:   { headerHeight: g.node.headerHeight },
      pin:    { rowSpacing: g.pin.rowSpacing, rowHeight: g.pin.rowHeight, diameter: g.pin.diameter, labelGap: g.pin.labelGap },
      header: { toPinsGap: g.header.toPinsGap },
      widget: { rowHeight: g.widget.rowHeight, gap: g.widget.gap, paddingX: g.widget.paddingX },
    }
  }

  /** True when the data IN-pin identified by `pinKey` (matched against pin label, then id) has
   *  ≥1 incoming edge. Drives pin-bound widget visibility — a widget bound to a connected pin is
   *  hidden so the pin's normal label takes the row width. */
  #isPinConnected(nodeId: NodeId, pinKey: string): boolean {
    const node = this.graph.getNode(nodeId)
    if (!node) return false
    const pin = findPinByKey(node as Node, pinKey)
    if (!pin) return false
    const pinId = String(pin.id)
    // Walk only edges INCIDENT to this node — O(node.degree), not O(graph.E). Called per-frame from
    // `#positionDomWidgets` for every visible DOM widget, so the index lookup is what keeps a 10k
    // node + 9k edge graph at 60fps; a naïve `graph.edges()` walk would melt it.
    for (const eid of this.#edgesByNode.get(nodeId) ?? []) {
      const e = this.graph.getEdge(eid as EdgeId)
      if (e && String(e.to.node) === String(nodeId) && String(e.to.pin) === pinId) return true
    }
    return false
  }

  #ensureDomLayer(): HTMLDivElement {
    if (!this.#domLayer) {
      const l = document.createElement('div')
      Object.assign(l.style, { position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none', zIndex: '5' })
      if (getComputedStyle(this.#host).position === 'static') this.#host.style.position = 'relative'
      this.#host.appendChild(l)
      this.#domLayer = l
    }
    return this.#domLayer
  }

  /** Mount/unmount DOM custom widgets to match the current graph, then position them. Called after
   *  structural changes (load, add, re-render, theme swap). */
  /** Expose the active widget theme as --xeno-* CSS custom properties on a DOM widget's host, so
   *  framework/vanilla widgets can style with var(--xeno-accent) etc. and track the theme for free. */
  #applyWidgetVars(el: HTMLElement, spec: { style?: WidgetStyle }): void {
    const vars = widgetCssVars(resolveWidgetStyle(this.#theme.tokens, spec.style))
    for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v)
  }

  /** Resolve the value a widget should display: live runtime value when its bound pin is wired
   *  AND visibility is 'always' (display widgets), else the stored state default. Applies to
   *  BOTH custom and built-in widgets — display-mode contract is widget-type-agnostic. */
  #widgetDisplayValue(node: Node, w: WidgetSpec): unknown {
    const bind = widgetBindKey(w)
    if (bind && widgetVisibility(w) === 'always' && this.#isPinConnected(node.id, bind)) {
      const live = this.#pinLiveValueProvider?.(node.id, bind)
      if (live !== undefined) return live
    }
    return widgetValue(node, w)
  }
  /** True when the widget is a "live readout" — bound IN-pin is wired AND visibility is 'always'.
   *  Editing such widgets is suppressed (the next live update would clobber the change). */
  #isDisplayModeWidget(node: Node, w: WidgetSpec): boolean {
    const bind = widgetBindKey(w)
    return !!bind && widgetVisibility(w) === 'always' && this.#isPinConnected(node.id, bind)
  }

  #syncDomWidgets(): void {
    const seen = new Set<string>()
    for (const node of this.graph.nodes()) {
      for (const w of node.widgets ?? []) {
        if (w.type !== 'custom') continue
        const ctrl = this.#widgetControllers.get(w.renderer)
        if (!ctrl || !isDomWidgetController(ctrl)) continue
        const key = `${String(node.id)}:${w.id}`
        seen.add(key)
        if (this.#domWidgets.has(key)) {
          this.#applyWidgetVars(this.#domWidgets.get(key)!.el, w)
          ctrl.update?.({ value: this.#widgetDisplayValue(node as Node, w), node, width: 0, height: 0, ...this.#widgetThemeColors(w) })
          continue
        }
        const el = document.createElement('div')
        Object.assign(el.style, { position: 'absolute', pointerEvents: 'auto', transformOrigin: 'top left' })
        this.#applyWidgetVars(el, w)
        this.#ensureDomLayer().appendChild(el)
        const cleanup = ctrl.mount(el, {
          value: this.#widgetDisplayValue(node as Node, w), node, width: 0, height: 0, ...this.#widgetThemeColors(w),
          setValue: (v) => this.setWidgetValue(node.id, w.id, v),
        })
        const entry: { el: HTMLElement; controller: DomWidgetController; cleanup?: () => void; nodeId: NodeId; widgetId: string } =
          { el, controller: ctrl, nodeId: node.id, widgetId: w.id }
        if (typeof cleanup === 'function') entry.cleanup = cleanup
        this.#domWidgets.set(key, entry)
      }
    }
    for (const [key, rec] of this.#domWidgets) {
      if (seen.has(key)) continue
      rec.cleanup?.(); rec.controller.unmount?.(); rec.el.remove()
      this.#domWidgets.delete(key)
    }
    this.#positionDomWidgets()
  }

  /** Sync each mounted DOM widget to its node's on-screen widget rect. Cheap — runs per painted
   *  frame so pan/zoom/drag/collapse keep the element glued to the node. */
  #positionDomWidgets(): void {
    if (this.#domWidgets.size === 0) return
    const vp = this.#viewport.state
    const layout = this.#widgetLayoutTokens()
    // Paint-order index per node container, so DOM widgets can match the canvas z-order and hide
    // where a higher node occludes them (DOM always paints above the WebGL canvas, so without this
    // a back node's widget bleeds over a front node's body).
    const z = new Map<unknown, number>()
    this.#nodesLayer.children.forEach((c, i) => z.set(c, i))
    for (const rec of this.#domWidgets.values()) {
      const node = this.graph.getNode(rec.nodeId)
      const view = this.#views.get(rec.nodeId)
      const rect = node?.size ? computeWidgetRects(node, node.size.x, layout, { isPinConnected: (k) => this.#isPinConnected(rec.nodeId, k) }).find((r) => r.id === rec.widgetId) : undefined
      if (!node || !view || !rect || view.isCollapsed()) { rec.el.style.display = 'none'; continue }
      // Use the VIEW container's live world position, not node.position — during a drag the model
      // position isn't committed until drop, but the container moves every frame.
      const left = (view.container.x + rect.x) * vp.zoom + vp.x
      const top = (view.container.y + rect.y) * vp.zoom + vp.y
      const w = rect.width * vp.zoom, h = rect.height * vp.zoom
      const myZ = z.get(view.container) ?? 0
      const W = rect.width, H = rect.height
      // Clip the widget to the VISIBLE region = widget rect MINUS every node painted above it
      // (DOM always paints above the WebGL canvas). Computed as a rectangle difference into a set
      // of NON-overlapping rects — overlapping evenodd "holes" cancel each other, so we subtract
      // explicitly instead. clip-path = the union of the surviving rects.
      const gn = this.#theme.tokens.geometry.node
      let vis: { x: number; y: number; w: number; h: number }[] = [{ x: 0, y: 0, w: W, h: H }]
      // Subtract an axis-aligned rect from the visible set (splits each survivor into ≤4 slivers).
      const subtract = (ax1: number, ay1: number, ax2: number, ay2: number): void => {
        if (ax2 - ax1 < 0.5 || ay2 - ay1 < 0.5) return
        const next: typeof vis = []
        for (const r of vis) {
          const ix1 = Math.max(r.x, ax1), iy1 = Math.max(r.y, ay1)
          const ix2 = Math.min(r.x + r.w, ax2), iy2 = Math.min(r.y + r.h, ay2)
          if (ix2 <= ix1 || iy2 <= iy1) { next.push(r); continue }
          if (iy1 > r.y) next.push({ x: r.x, y: r.y, w: r.w, h: iy1 - r.y })
          if (iy2 < r.y + r.h) next.push({ x: r.x, y: iy2, w: r.w, h: r.y + r.h - iy2 })
          if (ix1 > r.x) next.push({ x: r.x, y: iy1, w: ix1 - r.x, h: iy2 - iy1 })
          if (ix2 < r.x + r.w) next.push({ x: ix2, y: iy1, w: r.x + r.w - ix2, h: iy2 - iy1 })
        }
        vis = next
      }
      for (const [id, ov] of this.#views) {
        if (id === rec.nodeId || (z.get(ov.container) ?? 0) <= myZ) continue
        const other = this.graph.getNode(id)
        if (!other?.size) continue
        const collapsed = ov.isCollapsed()
        // A collapsed node occludes only its header pill (exact rect + radius from the view), not
        // its full expanded size. Expanded → the body rect (node radius).
        const cRect = collapsed ? ov.collapsedRect : undefined
        const localX = cRect?.x ?? 0, localY = cRect?.y ?? 0
        const ow = cRect?.w ?? other.size.x, oh = cRect?.h ?? other.size.y
        const ol = (ov.container.x + localX) * vp.zoom + vp.x, ot = (ov.container.y + localY) * vp.zoom + vp.y
        // Small pad to cover the front node's thin outline/border (pins are handled separately below).
        const OCC_PAD = 2
        const ox1 = (ol - left) / vp.zoom - OCC_PAD, oy1 = (ot - top) / vp.zoom - OCC_PAD
        const ox2 = ox1 + ow + OCC_PAD * 2, oy2 = oy1 + oh + OCC_PAD * 2
        // Occlude by the node's ROUNDED-rect shape, not its bounding box: the corners outside the
        // border radius aren't painted, so the node behind must show there (not be clipped to black).
        // Subtract the straight middle as one rect, then the rounded caps as arc-following strips.
        const cr = Math.max(0, Math.min((cRect?.r ?? gn.radius) + OCC_PAD, (ox2 - ox1) / 2, (oy2 - oy1) / 2))
        if (cr < 0.5) { subtract(ox1, oy1, ox2, oy2) }
        else {
          subtract(ox1, oy1 + cr, ox2, oy2 - cr) // straight middle band (full width)
          const STEP = 2
          for (let yy = 0; yy < cr; yy += STEP) {
            const dy = Math.min(STEP, cr - yy)
            // Inset at the strip's wider edge (toward the middle) so we slightly over-cover rather
            // than bleed: top cap widens downward, bottom cap widens upward.
            const d = cr - (yy + dy)
            const inset = cr - Math.sqrt(Math.max(0, cr * cr - d * d))
            subtract(ox1 + inset, oy1 + yy, ox2 - inset, oy1 + yy + dy)        // top cap strip
            subtract(ox1 + inset, oy2 - yy - dy, ox2 - inset, oy2 - yy)        // bottom cap strip
          }
        }
        // Pins poke out beyond the body silhouette — subtract a small box at each so the back widget
        // doesn't bleed over them.
        const wox = view.container.x + rect.x, woy = view.container.y + rect.y
        for (const pin of other.pins) {
          const pp = ov.pinLocalPosition(pin.id)
          if (!pp) continue
          const px = ov.container.x + pp.x - wox, py = ov.container.y + pp.y - woy
          subtract(px - 7, py - 7, px + 7, py + 7)
        }
      }
      if (vis.length === 0) { rec.el.style.display = 'none'; continue }
      const fullyVisible = vis.length === 1 && vis[0]!.x <= 0.5 && vis[0]!.y <= 0.5 && vis[0]!.w >= W - 0.5 && vis[0]!.h >= H - 0.5
      const clip = fullyVisible ? 'none'
        : `path("${vis.map((r) => `M${r.x.toFixed(1)} ${r.y.toFixed(1)} H${(r.x + r.w).toFixed(1)} V${(r.y + r.h).toFixed(1)} H${r.x.toFixed(1)} Z`).join(' ')}")`
      rec.el.style.display = ''
      rec.el.style.clipPath = clip
      rec.el.style.zIndex = String(myZ)
      rec.el.style.left = `${left}px`
      rec.el.style.top = `${top}px`
      rec.el.style.width = `${rect.width}px`
      rec.el.style.height = `${rect.height}px`
      rec.el.style.transform = `scale(${vp.zoom})`
    }
  }

  /** Theme accent/text/muted for a custom widget, so canvas/DOM widgets can match the active
   *  theme (gold on Xen, cyan on LG) unless their own `style` overrides those tokens. */
  #widgetThemeColors(spec?: { style?: WidgetStyle }): { accent: string; text: string; muted: string } {
    const r = resolveWidgetStyle(this.#theme.tokens, spec?.style)
    return { accent: r.fill, text: r.text, muted: r.label }
  }

  /** Subscribe to a public editor event (node/edge lifecycle, selection, viewport, widgets,
   *  history). Returns an unsubscribe fn. See {@link EditorEvents} for the full surface. */
  on<E extends keyof EditorEvents>(event: E, handler: (payload: EditorEvents[E]) => void): () => void {
    return this.#events.on(event, handler)
  }

  /** @deprecated use `on('widget:action', …)`. Kept as a thin alias over the unified event bus. */
  onWidgetAction(handler: (e: EditorEvents['widget:action']) => void): () => void {
    return this.#events.on('widget:action', handler)
  }

  /** Current value of a widget (clamped `node.state[key]`, or its default). */
  getWidgetValue(nodeId: NodeId, widgetId: string): unknown {
    const found = this.#widgetSpec(nodeId, widgetId)
    return found ? widgetValue(found.node, found.spec) : undefined
  }

  /** Set a widget's value. Clamps to the widget's constraints, refreshes the widget, and emits
   *  `widget:changed`. No-op for valueless widgets (button).
   *
   *  By default the write is undoable (a `SetNodeState` command). Pass `{ ephemeral: true }` for a
   *  transient write (e.g. a simulation updating readouts every tick): the state is mutated in place,
   *  the widget repaints and `widget:changed` fires, but NO command is pushed onto the undo stack —
   *  so a per-frame writer doesn't bloat undo history. */
  setWidgetValue(nodeId: NodeId, widgetId: string, value: unknown, opts?: { ephemeral?: boolean }): void {
    const found = this.#widgetSpec(nodeId, widgetId)
    if (!found || found.spec.key === undefined) return
    const clamped = clampWidgetValue(found.spec, value)
    if (opts?.ephemeral) {
      const node = this.graph.getNode(nodeId)
      if (node) (node.state as Record<string, unknown>)[found.spec.key] = clamped
    } else {
      this.commandBus.apply(new SetNodeState(nodeId, { [found.spec.key]: clamped }))
    }
    // A state-only change doesn't trigger a node re-render in #syncFromGraph, so refresh the
    // widget's visual directly (combo/number/text would otherwise show the stale value).
    this.#views.get(nodeId)?.updateWidget?.(widgetId, clamped)
    // A1 — displayOptions.show: if any sibling widget conditions its visibility on this node's
    // state, the change might toggle it on/off, which changes layout (height + widget rects). Do
    // a full rerender ONLY when the node opts in (avoids the per-keystroke rebuild on plain nodes).
    // CRITICAL: recompute node.size before the rerender — measureNodeSize is the single source for
    // backdrop/edges/bounds, and the existing cached size doesn't know about the new visibility.
    const node = this.graph.getNode(nodeId) as Node | undefined
    if (node?.widgets?.some((w) => w.displayOptions?.show !== undefined)) {
      const title = this.#renderOpts.get(nodeId)?.title ?? node.type
      node.size = measureNodeSize(node, title, this.#sizeTokens(), this.#textMeasure, (k) => this.#isPinConnected(nodeId, k))
      this.#rerenderNode(nodeId)
    }
    // Propagate to downstream display widgets: if THIS widget is bound to an OUT-pin, every IN-pin
    // it feeds may host a `visibility:'always'` widget that needs to repaint with the new live
    // value (built-in OR custom — display-mode contract is widget-type-agnostic). Without this,
    // moving an upstream slider leaves downstream readouts stale until something else triggers a
    // node re-render. Edges incident to the source are O(degree) via #edgesByNode.
    this.#propagateToDisplayConsumers(nodeId, found.spec)
    this.#requestRender()
    this.#events.emit('widget:changed', { nodeId, widgetId, value: clamped })
    // H2 — defineDynamicNode: if the node's schema declares a `dynamic` callback, let it
    // recompute pins/widgets from the latest state. We do this AFTER emitting widget:changed
    // so listeners observing the value see it before any structural pin/widget mutation lands.
    this.#applyDynamicSchema(nodeId)
  }

  #applyDynamicSchema(nodeId: NodeId): void {
    const node = this.graph.getNode(nodeId) as Node | undefined
    if (!node) return
    const dyn = this.#registry.get(node.type)?.dynamic
    if (!dyn) return
    let result: { pins?: PinSchema[]; widgets?: WidgetSpec[] } | undefined
    try { result = dyn(node) } catch { return }
    if (!result) return
    if (result.pins) {
      const pins: Pin[] = result.pins.map((p, i) => {
        const existing = node.pins[i]
        // Reuse existing pin id when possible (preserves incident edges); mint fresh otherwise.
        const id = existing && existing.label === p.label && existing.direction === p.direction
          ? existing.id
          : createPinId()
        const pin: Pin = {
          id, kind: p.kind, direction: p.direction, type: p.type,
          multiple: p.multiple ?? false,
        }
        if (p.label !== undefined) pin.label = p.label
        if (p.default !== undefined) pin.default = p.default
        return pin
      })
      this.setNodePins(nodeId, pins)
    }
    if (result.widgets) this.setNodeWidgets(nodeId, result.widgets)
  }

  #propagateToDisplayConsumers(srcNodeId: NodeId, srcSpec: WidgetSpec): void {
    const bind = widgetBindKey(srcSpec)
    if (!bind) return
    const srcNode = this.graph.getNode(srcNodeId)
    if (!srcNode) return
    const srcPin = srcNode.pins.find((p) => p.label === bind || String(p.id) === bind)
    if (!srcPin || srcPin.direction !== 'out') return
    const out = this.#edgesByNode.get(srcNodeId)
    if (!out) return
    for (const eid of out) {
      const edge = this.graph.getEdge(eid)
      if (!edge || String(edge.from.pin) !== String(srcPin.id)) continue
      const dstNode = this.graph.getNode(edge.to.node)
      if (!dstNode || !dstNode.widgets) continue
      const dstView = this.#views.get(edge.to.node)
      if (!dstView?.updateWidget) continue
      for (const w of dstNode.widgets) {
        const dbind = widgetBindKey(w)
        if (!dbind || widgetVisibility(w) !== 'always') continue
        const dpin = dstNode.pins.find((p) => p.label === dbind || String(p.id) === dbind)
        if (!dpin || String(dpin.id) !== String(edge.to.pin)) continue
        const live = this.#widgetDisplayValue(dstNode as Node, w)
        dstView.updateWidget(w.id, live)
      }
    }
  }

  /** Registry of node schemas. Hosts register their node types here; the insert palette searches
   *  it. e.g. `editor.registry.register({ type: 'Transform', title: 'Transform', pins: [...] })`. */
  get registry(): NodeRegistry { return this.#registry }

  /** Registry of custom pin-type descriptors (colour/shape/compatibility). Drives connection
   *  validation and pin colours. e.g. `editor.types.register({ id: 'struct:Agent', color: '#9b59ff' })`. */
  get types(): TypeRegistry { return this.#types }

  /** Toggle the dive breadcrumb (Root › Def1 › Def2 …) in the overlay root. Visible by default
   *  whenever the editor is inside a template definition (`diveDepth > 0`). Hosts that render
   *  their own navigation can `setBreadcrumbVisible(false)` to suppress. */
  setBreadcrumbVisible(visible: boolean): void {
    this.#breadcrumbDisabled = !visible
    this.#updateBreadcrumb()
  }

  /** Named-commands registry — hosts register their own actions (`editor.commands.register({id,
   *  label, execute, canExecute?, hotkey?})`) and Xenolith routes matching key chords through
   *  it. Baklava commandHandler parity. The hotkey listener fires BEFORE built-in shortcuts so
   *  hosts can override them. */
  get commands(): CommandRegistry { return this.#commands }

  /** Open the properties sidebar for `nodeId` — a DOM panel that lists every widget on that
   *  node flagged with `showInSidebar: true`. Theme-aware (--xeno-* CSS vars). Lazy: the panel
   *  is created on first open and reused. Programmatic only — there's no per-node cog button;
   *  hosts wire their own trigger (toolbar button, double-click, palette command). No-op when
   *  `nodeId` doesn't exist. Fires `sidebar:opened`. */
  openSidebar(nodeId: NodeId): void {
    this.#ensureSidebar()
    this.#sidebar!.open(nodeId)
  }
  closeSidebar(): void { this.#sidebar?.close() }
  isSidebarOpen(): boolean { return this.#sidebar?.isOpen() ?? false }
  /** Re-read the open node's state and repaint the panel. Wired internally to widget:changed
   *  + setNodeWidgets; hosts rarely call this directly. */
  refreshSidebar(): void { this.#sidebar?.refresh() }

  /** G6 — persistent palette sidebar. Docked DOM panel listing every registered NodeSchema
   *  grouped by category, draggable onto the canvas. Off by default; toggle with `true`/`false`.
   *  Drag-and-drop is wired through the canvas's existing `node:drop` event — the panel sets
   *  `text/plain` to the schema's `type`, the editor inserts it at the drop point automatically. */
  setPaletteSidebar(opts: boolean | PaletteSidebarOpts): void {
    if (opts === false) {
      this.#paletteSidebar?.unmount()
      this.#paletteSidebar = null
      return
    }
    const cfg = opts === true ? {} : opts
    if (!this.#paletteSidebar) {
      this.#paletteSidebar = new PaletteSidebar(this.#registry, this.overlayRoot, cfg)
      this.#paletteSidebar.mount()
      // Auto-insertNode when a palette item is dropped on the canvas. Host listeners can also
      // observe `node:drop` to layer on validation / snapping; this default path keeps the
      // panel useful out of the box.
      this.on('node:drop', (e) => {
        if (e.text && this.#registry.has(e.text)) this.insertNode(e.text, e.position)
      })
    } else {
      this.#paletteSidebar.refresh()
    }
  }

  #ensureSidebar(): void {
    if (this.#sidebar) return
    this.#sidebar = new SidebarManager({
      overlayRoot: this.overlayRoot,
      getNode: (id) => this.graph.getNode(id) as Node | undefined,
      getNodeTitle: (id) => this.#renderOpts.get(id)?.title,
      setWidgetValue: (nodeId, widgetId, value) => this.setWidgetValue(nodeId, widgetId, value),
      onOpen: (nodeId) => this.#events.emit('sidebar:opened', { nodeId }),
      onClose: () => this.#events.emit('sidebar:closed', {}),
    })
    // Keep the panel in sync with state mutations + structural changes. Cheap (no-op when closed).
    this.on('widget:changed', () => this.#sidebar?.refresh())
    this.on('node:removed', ({ nodeId }) => {
      if (this.#sidebar?.currentNodeId() === nodeId) this.#sidebar.close()
    })
  }

  /** Registry of header glyph icons. Has a built-in Feather set (`layers`, `box`, `cpu`, `database`,
   *  `branch`, `code`, `play`, …); add your own via `editor.icons.register('name', '<path …/>')`.
   *  Set a node's glyph through `NodeSchema.glyph` or `editor.setNodeGlyph(id, { icon, side })`. */
  get icons(): IconRegistry { return this.#icons }

  /** Set (or clear with `null`) a node's header glyph at runtime — overrides any schema glyph. The
   *  icon must be registered in `editor.icons`. Re-renders the node (it refits to the glyph). */
  setNodeGlyph(nodeId: NodeId, glyph: NodeGlyph | null): void {
    const node = this.graph.getNode(nodeId)
    if (!node) return
    if (glyph) (node as { glyph?: NodeGlyph }).glyph = { ...glyph }
    else delete (node as { glyph?: NodeGlyph }).glyph
    delete (node as { size?: unknown }).size // the glyph reserves header width → refit
    this.#rerenderNode(nodeId)
    this.#requestRender()
  }

  /** Resolve a node's effective header glyph to drawable svg + side: an explicit `node.glyph` wins,
   *  else the built-in template/group markers. Returns undefined for a plain node. */
  #resolveGlyph(node: Node): { svg: string; side: 'left' | 'right' } | undefined {
    if (node.glyph) {
      const svg = this.#icons.get(node.glyph.icon)
      if (svg) return { svg, side: node.glyph.side ?? 'left' }
    }
    if (isTemplateInstance(node)) return { svg: this.#icons.get('layers')!, side: 'left' }
    if (isMacro(node)) return { svg: this.#icons.get('box')!, side: 'left' }
    return undefined
  }

  /** Install a plugin. `install` runs immediately with a {@link PluginContext}; any returned
   *  disposer runs on `destroy()`. Throws if a plugin with the same `name` is already installed. */
  use(plugin: XenolithPlugin): void { this.#pluginHost.use(plugin) }

  /** Build the stable facade handed to a plugin's `install`. `graph`/`commandBus` are getters so a
   *  plugin always reads the currently displayed graph (root, or a dived template definition). */
  #pluginContext(): PluginContext {
    const self = this
    return {
      registry: self.#registry,
      types: self.#types,
      icons: self.#icons,
      app: self.#app,
      requestRender: () => self.#requestRender(),
      setNodePositionEphemeral: (nodeId, x, y) => self.#setNodePositionEphemeral(nodeId, x, y),
      get graph(): Graph { return self.#displayGraph },
      get commandBus(): CommandBus { return self.#displayBus },
      registerWidget: (name, controller) => self.registerWidget(name, controller),
      setIsValidConnection: (fn) => self.setIsValidConnection(fn),
      on: (event, handler) => self.on(event, handler),
      onTick: (cb) => self.onTick(cb),
      startLoop: (opts) => self.startLoop(opts),
      stopLoop: () => self.stopLoop(),
      step: (dtMs) => self.step(dtMs),
      setWidgetValue: (nodeId, widgetId, value, opts) => self.setWidgetValue(nodeId, widgetId, value, opts),
      setNodePins: (nodeId, pins) => self.setNodePins(nodeId, pins),
      setNodeWidgets: (nodeId, widgets) => self.setNodeWidgets(nodeId, widgets),
      setEdgeAnimated: (edgeId, animated) => self.setEdgeAnimated(edgeId, animated),
      expandTemplateInstance: (nodeId) => self.expandTemplateInstance(nodeId),
      graphSnapshot: (opts) => self.graphSnapshot(opts),
    }
  }

  /** Open the insert palette. `screen` is a canvas-relative point (defaults to last pointer
   *  position, then canvas centre). No-op if the registry is empty. */
  openPalette(screen?: { x: number; y: number }): void {
    if (this.#registry.size === 0 && this.#builtins.size === 0 && this.#templateRegistry.size === 0) return
    if (!this.#palette) {
      this.#palette = new InsertPalette(this.#host, this.#theme.paletteStyle, {
        search: (q) => this.#searchSchemas(q),
        insert: (type, at) => this.#insertFromPalette(type, at),
        pinColor: (type) => resolvePinFill(type, this.#theme.tokens, this.#types),
      })
    }
    const at = screen
      ?? this.#lastPointerScreen
      ?? { x: this.#app.screen.width / 2, y: this.#app.screen.height / 2 }
    this.#palette.open(at)
  }
  closePalette(): void { this.#pendingEdgeSplice = null; this.#palette?.close() }
  get isPaletteOpen(): boolean { return this.#palette?.isOpen ?? false }

  /** Palette search across both the host registry and the built-in schemas. Host types win on a
   *  type collision; results stay sorted by descending fuzzy score. */
  #searchSchemas(query: string): ReturnType<NodeRegistry['search']> {
    const host = this.#registry.search(query).sort((a, b) => b.score - a.score)
    const seen = new Set(host.map((r) => r.schema.type))
    // Built-in core nodes (Reroute) rank ABOVE host matches so they're easy to find. Template
    // interface boundaries ($templateInput/$templateOutput) only make sense while editing a template
    // definition — hide them at the root document (dive depth 0).
    const insideTemplate = this.diveDepth > 0
    const builtins = this.#builtins.search(query)
      .filter((r) => !seen.has(r.schema.type))
      .filter((r) => insideTemplate || (r.schema.type !== TEMPLATE_INPUT_TYPE && r.schema.type !== TEMPLATE_OUTPUT_TYPE))
      .sort((a, b) => b.score - a.score)
    // Registered template definitions — reusable subgraphs the user has created; rank with host types.
    // While dived, HIDE any definition that would recurse if inserted here: the current definition
    // itself and every ancestor up the branch (each transitively contains the current one). This both
    // prevents recursion and declutters — you simply can't pick a template that would loop.
    const templates = this.#templateRegistry.search(query)
      .filter((r) => !seen.has(r.schema.type))
      .filter((r) => !this.#wouldRecurse(r.schema.type as TemplateDefId))
      .sort((a, b) => b.score - a.score)
    let merged = [...builtins, ...templates, ...host]
    // When opened from an edge's "Add Node", show only nodes that can be spliced into that wire.
    const splice = this.#pendingEdgeSplice
    if (splice) merged = merged.filter((r) => spliceCompatible(r.schema, splice.srcType, splice.dstType))
    return merged
  }

  /** The registry that owns a type (host registry takes precedence over built-ins). */
  #registryFor(type: string): NodeRegistry | null {
    if (this.#registry.has(type)) return this.#registry
    if (this.#builtins.has(type)) return this.#builtins
    return null
  }

  /** Instantiate a registered schema at a world position and add it through the command bus
   *  (undoable). Selects the new node. Returns it, or null if the type isn't registered. */
  insertNode(type: string, worldPos: { x: number; y: number }, opts: { center?: boolean } = {}): Node | null {
    // A registered template definition inserts as a fresh instance (not a registry schema).
    if (this.#definitions.has(type as TemplateDefId)) return this.#insertTemplateInstance(type as TemplateDefId, worldPos, opts)
    const reg = this.#registryFor(type)
    if (!reg) return null
    const schema = reg.get(type)!
    const node = reg.instantiate(type, worldPos)
    const render: RenderNodeOptions = {}
    if (schema.category !== undefined) render.category = schema.category
    if (schema.title !== undefined) render.title = schema.title
    // Always resolve size up front: virtualized off-screen nodes are never materialised into a view
    // (LOD draws them straight from `node.size`), and a missing size falls back to `headerHeight` only
    // — they render as squished strips at zoom-out. Centering also needs it, so the same call covers
    // both paths.
    this.#ensureSize(node, render)
    if (opts.center) {
      node.position = { x: worldPos.x - node.size!.x / 2, y: worldPos.y - node.size!.y / 2 }
    }
    this.#renderOpts.set(node.id, render)
    this.commandBus.apply(new AddNode(node))
    // Inserted while a macro is open → the new node joins that macro (otherwise you couldn't build
    // a macro's contents). Add it to the open macro's member list and reparent it into the overlay.
    const open = this.#deepestExpandedMacro()
    if (open) {
      const macro = this.graph.getNode(open)
      if (macro) {
        this.commandBus.apply(new SetNodeState(open, { members: [...macroMembers(macro as Node), node.id] }))
        this.#applyMacroVisibility()
      }
    }
    this.selection.replaceWith([node.id])
    return node
  }

  #insertFromPalette(type: string, screen: { x: number; y: number }): void {
    const world = screenToWorld(screen, this.#viewport.state)
    if (type === COMMENT_PALETTE_TYPE) {
      // Comments are frames, not nodes — anchor the new frame's top-left at the cursor.
      this.#pendingEdgeSplice = null
      this.addComment({ position: snapToGrid(world, this.#snapSize), size: { x: 240, y: 180 }, text: 'New comment' })
      return
    }
    const splice = this.#pendingEdgeSplice
    this.#pendingEdgeSplice = null
    const node = splice
      ? this.insertNode(type, world, { center: true })
      : this.insertNode(type, snapToGrid(world, this.#snapSize))
    if (node && splice) {
      const edge = this.graph.getEdge(splice.edgeId)
      if (edge) {
        // The node was already added by insertNode; splice rewires the original edge through it.
        this.#spliceIntoEdge(edge as Edge, node, { nodeAlreadyAdded: true })
      }
    }
  }

  /** Insert an inline reroute dot at `worldPos`, splitting `edgeId` so the wire passes through it.
   *  Undoable as one transaction. Returns the new reroute's id, or null if the edge is gone. */
  insertRerouteOnEdge(edgeId: EdgeId, worldPos: { x: number; y: number }): NodeId | null {
    const edge = this.graph.getEdge(edgeId)
    if (!edge) return null
    const srcNode = this.graph.getNode(edge.from.node)
    const srcPin = srcNode?.pins.find((p) => String(p.id) === String(edge.from.pin))
    const type = String(srcPin?.type ?? 'any')
    const r = this.#theme.tokens.geometry.reroute.radius
    // Centre the disc on the click point (createReroute positions by top-left corner).
    const reroute = createReroute({ x: worldPos.x - r, y: worldPos.y - r }, { type })
    if (!this.#spliceIntoEdge(edge as Edge, reroute, { nodeAlreadyAdded: false })) return null
    this.selection.replaceWith([reroute.id])
    return reroute.id
  }

  /** Delete a single edge. Removes only that edge; any inline reroute it leaves with no remaining
   *  connections is removed too (inline reroutes can't exist standalone), but reroutes that still
   *  relay something survive — the chain isn't chopped. Undoable as one transaction. */
  deleteEdge(edgeId: EdgeId): boolean {
    if (!this.graph.getEdge(edgeId)) return false
    const edges = Array.from(this.graph.edges()) as Edge[]
    const plan = danglingRerouteRemovalPlan(
      edges, (id) => { const n = this.graph.getNode(id); return !!n && isReroute(n) }, edgeId,
    )
    this.commandBus.transaction(() => {
      // RemoveNode drops a reroute's own incident edges; explicitly disconnect the rest.
      for (const id of plan.edgeIds) {
        const e = this.graph.getEdge(id as EdgeId)
        if (e && !plan.rerouteIds.some((r) => r === e.from.node || r === e.to.node)) {
          this.commandBus.apply(new DisconnectEdge(id as EdgeId))
        }
      }
      for (const id of plan.rerouteIds) this.commandBus.apply(new RemoveNode(id))
    })
    return true
  }

  /** Rewire `edge` (source → target) to run source → node → target. Picks the node's first
   *  type-compatible in/out pins. When `nodeAlreadyAdded` is false the node is added inside the
   *  same transaction. Returns false if the node lacks a usable in or out pin. */
  #spliceIntoEdge(edge: Edge, node: Node, opts: { nodeAlreadyAdded: boolean }): boolean {
    const srcNode = this.graph.getNode(edge.from.node)
    const dstNode = this.graph.getNode(edge.to.node)
    const srcPin = srcNode?.pins.find((p) => String(p.id) === String(edge.from.pin)) ?? null
    const dstPin = dstNode?.pins.find((p) => String(p.id) === String(edge.to.pin)) ?? null
    const inPin =
      (srcPin && node.pins.find((p) => p.direction === 'in' && canConnect(srcPin, p, false))) ||
      node.pins.find((p) => p.direction === 'in')
    const outPin =
      (dstPin && node.pins.find((p) => p.direction === 'out' && canConnect(p, dstPin, false))) ||
      node.pins.find((p) => p.direction === 'out')
    if (!inPin || !outPin) return false

    const srcType = String(srcPin?.type ?? 'any')
    const upstream: Edge = { id: createEdgeId(), from: { ...edge.from }, to: { node: node.id, pin: inPin.id } }
    const downstream: Edge = { id: createEdgeId(), from: { node: node.id, pin: outPin.id }, to: { ...edge.to } }
    this.#edgeOpts.set(upstream.id, { sourceType: srcType })
    this.#edgeOpts.set(downstream.id, { sourceType: String(outPin.type === 'any' ? srcType : outPin.type) })

    this.commandBus.transaction(() => {
      this.commandBus.apply(new DisconnectEdge(edge.id))
      if (!opts.nodeAlreadyAdded) this.commandBus.apply(new AddNode(node))
      this.commandBus.apply(new ConnectPins(upstream))
      this.commandBus.apply(new ConnectPins(downstream))
    })
    return true
  }

  /** Edge whose midpoint handle is within `tolerance` world units of `world`, or null. The handle
   *  dot — not the whole wire — is the interaction target, so right-click only triggers on the dot.
   *  O(edges); only called on right-click. */
  #pickEdgeAt(world: { x: number; y: number }, tolerance: number): EdgeId | null {
    let best: EdgeId | null = null
    let bestDist = tolerance
    const edgeTokens = this.#theme.tokens.geometry.edge
    for (const edge of this.graph.edges()) {
      const fromNode = this.graph.getNode(edge.from.node)
      const toNode = this.graph.getNode(edge.to.node)
      if (!fromNode || !toNode) continue
      const from = this.#pinWorldPosition(fromNode as Node, String(edge.from.pin))
      const to = this.#pinWorldPosition(toNode as Node, String(edge.to.pin))
      if (!from || !to) continue
      const mid = bezierMidpoint(computeEdgePath(from, to, edgeTokens))
      const d = Math.hypot(world.x - mid.x, world.y - mid.y)
      if (d < bestDist) { bestDist = d; best = edge.id }
    }
    return best
  }

  /** Highlight the edge midpoint dot under the cursor with a ring + pointer cursor. No-op churn
   *  when the hovered edge hasn't changed. */
  #updateEdgeMidpointHover(world: { x: number; y: number }): void {
    const tol = this.#theme.tokens.geometry.edge.midpointRadius + 5
    const id = this.#pickEdgeAt(world, tol)
    if (id === this.#hoveredEdgeMid) return
    this.#hoveredEdgeMid = id
    this.#edgeHoverGfx.clear()
    const canvas = this.#app.canvas as HTMLCanvasElement
    if (!id) { canvas.style.cursor = ''; this.#requestRender(); return }
    const edge = this.graph.getEdge(id)
    const fromNode = edge && this.graph.getNode(edge.from.node)
    const toNode = edge && this.graph.getNode(edge.to.node)
    if (edge && fromNode && toNode) {
      const from = this.#pinWorldPosition(fromNode as Node, String(edge.from.pin))
      const to = this.#pinWorldPosition(toNode as Node, String(edge.to.pin))
      if (from && to) {
        const mid = bezierMidpoint(computeEdgePath(from, to, this.#theme.tokens.geometry.edge))
        const rr = this.#theme.tokens.geometry.edge.midpointRadius + 3
        this.#edgeHoverGfx.circle(mid.x, mid.y, rr)
          .stroke({ color: 0xffffff, width: 1.5 / this.#viewport.state.zoom, alpha: 0.9 })
      }
    }
    canvas.style.cursor = 'pointer'
    this.#requestRender()
  }

  /** Serialize the current graph (nodes + edges + render opts + viewport) into the canonical
   *  `xenolith.v1` envelope. The returned object is JSON-safe. */
  toJSON(): XenolithGraphV1 {
    // If we're dived into a definition, flush its live edits back into stored data first so they're
    // serialized too.
    this.#flushActiveDefinition()
    // Always serialize the ROOT document (not whatever's displayed while dived into a template), and
    // include the template definitions. Edge opts merge the persistent map (covers template edges no
    // longer live in the display) with the live records (authoritative for displayed edges).
    const edgeOpts = new Map<EdgeId, RenderEdgeOptions>(this.#edgeOpts)
    for (const [id, r] of this.#edgeRecords) edgeOpts.set(id, r.opts)
    // G5 — per-node custom serialize override. Schemas can opt into a `serialize(node)` callback
    // when their state holds anything the default JSON shape can't round-trip (Maps, class
    // instances, RAF handles). We materialise the node WITH the custom state BEFORE handing it
    // to the generic serializer, so the override is transparent to the rest of the pipeline.
    const rawNodes = Array.from(this.#rootGraph.nodes())
    const serializedNodes = rawNodes.map((n) => {
      const ser = this.#registry.get(n.type)?.serialize
      if (!ser) return n
      try {
        const customState = ser(n as Node)
        return { ...n, state: customState }
      } catch {
        return n                                             // fall back to default if user fn throws
      }
    })
    return serializeXenolithGraph({
      nodes:      serializedNodes,
      edges:      Array.from(this.#rootGraph.edges()),
      comments:   Array.from(this.#rootGraph.comments()),
      renderOpts: this.#renderOpts as ReadonlyMap<NodeId, RenderNodeOptions>,
      edgeOpts,
      viewport:   this.#viewport.state,
      ...(this.#categoryPalette ? { categories: this.#categoryPalette } : {}),
      ...(this.#definitions.size > 0 ? { templates: [...this.#definitions.values()] } : {}),
    })
  }

  /** The current graph serialized to an `xenolith.v1` JSON Blob (for download / save). */
  exportJSON(): Blob {
    return new Blob([JSON.stringify(this.toJSON(), null, 2)], { type: 'application/json' })
  }

  /** Open a WebSocket connection to a running `@xenolith/mcp-server` so an external MCP client
   *  (Claude Desktop / Cursor / any) can drive this editor. The server forwards each tool call
   *  here over the socket; handlers route to `insertNode`/`addEdge`/`fitView`/etc. (already
   *  undoable via the command bus). Returns a disconnect function. See `mcp.ts` for the protocol. */
  #mcp: import('./mcp.js').McpClient | null = null
  async connectMCP(
    url: string,
    opts: { onStatus?: (s: 'connecting' | 'open' | 'closed' | 'error') => void } = {},
  ): Promise<() => void> {
    const { McpClient } = await import('./mcp.js')
    this.#mcp?.disconnect()
    const client = new McpClient(
      this as unknown as import('./mcp.js').McpEditorSurface,
      opts.onStatus !== undefined ? { onStatus: opts.onStatus } : {},
    )
    await client.connect(url)
    this.#mcp = client
    return () => { client.disconnect(); this.#mcp = null }
  }

  /** World-space bounding box of all nodes, or null when the graph is empty. */
  #graphBounds(): { x: number; y: number; w: number; h: number } | null {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const n of this.graph.nodes()) {
      const size = n.size ?? { x: this.#theme.tokens.geometry.node.minWidth, y: 40 }
      minX = Math.min(minX, n.position.x); minY = Math.min(minY, n.position.y)
      maxX = Math.max(maxX, n.position.x + size.x); maxY = Math.max(maxY, n.position.y + size.y)
    }
    if (!Number.isFinite(minX)) return null
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }

  /** Render the WHOLE graph (independent of the current viewport) to a high-resolution image Blob.
   *  PNG is transparent; JPEG fills the theme's canvas colour. Heavy on big graphs — pair with the
   *  busy overlay (`withOverlay`). Follows the editor's existing RenderTexture pattern. */
  async exportImage(opts: { format?: 'png' | 'jpeg'; quality?: number; padding?: number; scale?: number } = {}): Promise<Blob> {
    const format = opts.format ?? 'png'
    const padding = opts.padding ?? 48
    const scale = opts.scale ?? 2
    const b = this.#graphBounds() ?? { x: 0, y: 0, w: 1, h: 1 }
    const width = Math.ceil(b.w + padding * 2)
    const height = Math.ceil(b.h + padding * 2)
    const rt = RenderTexture.create({ width, height, resolution: scale })

    // Render #world (grid included) at identity, offset so the graph's top-left lands at
    // (padding, padding). The grid is a huge tiling sprite, so it fills the whole export. The
    // viewport transform is saved and restored.
    const savedPos = { x: this.#world.x, y: this.#world.y }
    const savedScale = { x: this.#world.scale.x, y: this.#world.scale.y }
    this.#world.scale.set(1)
    this.#world.position.set(padding - b.x, padding - b.y)
    const clearColor = format === 'jpeg' ? this.#theme.tokens.color.surface.canvas : [0, 0, 0, 0]
    this.#app.renderer.render({ container: this.#world, target: rt, clearColor: clearColor as never })

    // Restore the live view.
    this.#world.position.set(savedPos.x, savedPos.y)
    this.#world.scale.set(savedScale.x, savedScale.y)
    this.#requestRender()

    const canvas = this.#app.renderer.extract.canvas(rt) as HTMLCanvasElement
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b2) => resolve(b2), `image/${format}`, opts.quality ?? 0.92),
    )
    rt.destroy(true)
    if (!blob) throw new Error('exportImage: canvas.toBlob returned null')
    return blob
  }

  /** Replace the editor's contents with the contents of an `xenolith.v1` payload. Wipes the
   *  existing graph, selection, and viewport before reloading. Throws on malformed input — the
   *  editor is left in its previous state in that case. */
  loadJSON(data: unknown): void {
    const parsed = parseXenolithGraph(data)
    this.#clearAll()
    this.#categoryPalette = parsed.categories // graph-owned category colours (undefined for old graphs)
    // Restore template definitions + their members'/boundary nodes' render+edge opts (parseTemplates
    // merged those into parsed.renderOpts/edgeOpts). Definition nodes aren't added to the live graph —
    // they materialise only when diving into an instance — so seed the opts maps here directly.
    if (parsed.templates) for (const def of parsed.templates) { this.#definitions.set(def.id, def); this.#registerTemplateSchema(def.id) }
    for (const [id, ro] of parsed.renderOpts) this.#renderOpts.set(id as NodeId, ro)
    for (const [id, eo] of parsed.edgeOpts) this.#edgeOpts.set(id as EdgeId, eo)
    // Past the virtualization threshold, materialising a view per node here is exactly what blows
    // up GPU memory on huge graphs. So add nodes as DATA only and let one #cullToViewport() pass
    // materialise just the visible ones. Below the threshold, take the normal 1:1 path (addNode).
    const willVirtualize = shouldVirtualize(parsed.nodes.length, this.#theme.virtualizeThreshold ?? 300)
    // Add EVERYTHING as data first (no views yet) so declarative collapsed macros can derive their
    // pins + rewire boundary edges on pure model state before anything is rendered.
    for (const node of parsed.nodes) {
      const schema = this.#registry.get(node.type)
      // A4 — NodeSchema.migrate. Before any other rehydration: if the on-disk node's version is
      // below the schema's current version, run the migration hook so downstream code sees the
      // up-to-date shape. The helper merges the patched payload back over the existing node and
      // bumps `node.version` to the schema's current. Defensive try/catch — a broken migrate
      // shouldn't lose the graph.
      try {
        const { node: patched } = migrateNodePayload(schema, node)
        Object.assign(node, patched)
      } catch { /* keep raw node on user-fn error */ }
      // G5 — let the registered schema rehydrate state from its custom JSON shape. Mirror of the
      // serialize override in toJSON. Falls back to the JSON state as-is when no fn is registered.
      const de = schema?.deserialize
      if (de) {
        try {
          const live = de(node.state as Record<string, unknown>, node)
          ;(node as { state: Record<string, unknown> }).state = live
        } catch { /* keep raw state on user-fn error */ }
      }
      this.#addNodeData(node, parsed.renderOpts.get(String(node.id)) ?? {})
    }
    for (const edge of parsed.edges) this.#addEdgeData(edge, parsed.edgeOpts.get(String(edge.id)) ?? {})
    for (const comment of parsed.comments) this.graph._addComment(comment)
    // `#addNodeData` bypasses the command bus, so the macro-parent index hasn't been invalidated
    // by event hooks — do it explicitly before `#materializeLoadedMacros` runs (it reads parents
    // to nest macros deepest-first).
    this.#invalidateMacroIndex()
    // A macro is stored DECLARATIVELY: a Macro node with state.members + collapsed, its members and
    // their real edges present as ordinary data. Materialise the collapse (derive proxy pins, rewire)
    // deepest-nested first, so an inner macro is a real collapsed node before an outer one collapses.
    this.#materializeLoadedMacros()
    if (parsed.viewport) this.#viewport.setState(parsed.viewport)
    // Build views: virtualized → cull near viewport; otherwise materialise everything 1:1.
    if (willVirtualize) this.#cullToViewport()
    else {
      for (const n of this.graph.nodes()) this.#ensureView(n as Node)
      for (const e of this.graph.edges()) if (!this.#edgeRecords.has(e.id)) this.#materializeEdge(e as Edge, this.#edgeOpts.get(e.id) ?? {})
    }
    this.#syncComments()
    this.#applyMacroVisibility()
    // loadJSON bypasses the command bus, so the command:applied hook that normally mounts DOM
    // widgets after a mutation doesn't run for the initial set — every custom-widget node would
    // paint with bare pins until the first drag/collapse forced a re-render. Force one pass now
    // so DOM controllers mount during the same frame as the rest of the node visual.
    this.#syncDomWidgets()
    // Refresh the minimap — loadJSON adds nodes as data (#addNodeData), which doesn't schedule a
    // minimap sync the way addNode does, so do it explicitly (otherwise the minimap keeps its 1×1
    // default bounds and renders empty).
    this.#scheduleMinimapSync()
    // loadJSON bypasses the command bus, so run the reroute type propagation explicitly.
    this.#propagateRerouteTypes()
    // A fresh load is not undoable — drop any prior history so the old graph's commands can't be
    // replayed onto the new one, and tell chrome (controls) the undo/redo stacks are empty.
    this.commandBus.clearHistory()
    this.#events.emit('graph:loaded', { nodeCount: parsed.nodes.length, edgeCount: parsed.edges.length })
    this.#events.emit('history:changed', { canUndo: false, canRedo: false })
  }

  /** Re-attach a deserialized edge using its preserved id and pin-id endpoints — bypasses the
   *  fresh-edge-id path of public `connect()`. */
  #loadEdge(edge: Edge, opts: RenderEdgeOptions): void {
    this.graph._addEdge(edge)
    if (!this.#materializeEdge(edge, opts)) this.graph._removeEdge(edge.id)
  }

  /** Tear down everything DISPLAY-scoped — views, edge graphics, spatial index, comment/macro views,
   *  GPU caches, LOD, hover state. Leaves the graph MODEL and document-level maps (#renderOpts,
   *  #edgeOpts, #definitions, #categoryPalette) intact. Used both by #clearAll (document wipe) and by
   *  dive in/out (swap which graph is shown without touching the model). Does NOT touch selection. */
  #teardownDisplay(): void {
    this.#nodeStatus.clear()
    this.#statusGfx?.clear()
    for (const { graphics } of this.#edgeRecords.values()) graphics.destroy()
    this.#edgeRecords.clear()
    for (const view of this.#views.values()) view.container.destroy({ children: true })
    this.#views.clear()
    this.#hoveredId = null
    this.#marqueeHovered.clear()
    for (const rt of this.#perNodeBackdropRT.values()) rt.destroy(true)
    this.#perNodeBackdropRT.clear()
    this.#lastOverlapPlan = new Map()
    // Reset LOD: a fresh display starts at full detail with the live layers visible. Drop the LOD
    // batch and the baked textures (the new graph may have a different type-set).
    this.#lodLevel = 'full'
    this.#lodLayer.removeChildren().forEach((c) => c.destroy())
    this.#lodLayer.visible = false
    this.#nodesLayer.visible = true
    this.#edgesLayer.visible = true
    for (const tex of this.#bakeCache.values()) tex.destroy(true)
    this.#bakeCache.clear()
    this.#spatialGrid.clear()
    this.#spatialMaxW = 0
    this.#spatialMaxH = 0
    this.#edgesByNode.clear()
    for (const v of this.#commentViews.values()) v.destroy()
    this.#commentViews.clear()
    for (const f of this.#macroFrames.values()) f.destroy()
    this.#macroFrames.clear()
    this.#hiddenMembers.clear()
  }

  /** Build views/edges/comments for whatever graph is currently displayed (#displayGraph). Mirrors
   *  the non-virtualized tail of loadJSON, but reads the display graph so it serves dive in/out too. */
  #rebuildDisplay(): void {
    this.#rebuildSpatialGrid()
    // #teardownDisplay wiped #edgesByNode; without this rebuild, every node materialised below
    // would call connectedPinIdsFor() against an empty index → every exec pin paints disconnected
    // (transparent fill) AND every visibility:'whenDisconnected' widget shows when it shouldn't.
    // First visible regression of templates — see docs/bug-exec-pins-look-disconnected-after-rebuild.md.
    this.#rebuildEdgeIndex()
    for (const n of this.graph.nodes()) this.#ensureView(n as Node)
    for (const e of this.graph.edges()) if (!this.#edgeRecords.has(e.id)) this.#materializeEdge(e as Edge, this.#edgeOpts.get(e.id) ?? {})
    this.#syncComments()
    this.#applyMacroVisibility()
    this.#propagateRerouteTypes()
    this.#scheduleMinimapSync()
    this.#requestRender()
  }

  #clearAll(): void {
    this.#invalidateMacroIndex()
    this.#categoryPalette = undefined
    this.#definitions.clear()
    this.#templateRegistry.clear()
    this.#diveStack = []
    this.#currentDefId = null
    this.#expandingMacros.clear()
    this.#updateBreadcrumb()
    this.#teardownDisplay()
    this.#edgeOpts.clear()
    this.#renderOpts.clear()
    for (const id of Array.from(this.#rootGraph.nodes()).map((n) => n.id)) this.#rootGraph._removeNode(id)
    for (const id of Array.from(this.#rootGraph.edges()).map((e) => e.id)) this.#rootGraph._removeEdge(id)
    this.#displayGraph = this.#rootGraph
    this.#displayBus = this.#rootBus
    this.selection.clear()
    this.#clipboard = null
    for (const id of [...this.#rootGraph.comments()].map((c) => c.id)) this.#rootGraph._removeComment(id)
  }

  /** Undo the most recent committed command (drag-drop MoveNode, ConnectPins from pin-drag, etc).
   *  Returns true if anything was undone. View sync happens automatically via the
   *  `command:undone` listener. */
  undo(): boolean { return this.commandBus.undo() }
  /** Redo the most recently undone command. Returns true if anything was redone. */
  redo(): boolean { return this.commandBus.redo() }
  /** Whether there is anything to undo / redo — lets chrome initialise its button state without
   *  waiting for the first `history:changed` event. */
  canUndo(): boolean { return this.commandBus.canUndo() }
  canRedo(): boolean { return this.commandBus.canRedo() }

  /** Select every node AND every comment in the graph. */
  selectAll(): void {
    // Top-level only: a collapsed macro is selected as the single wrapper node, NOT its hidden members
    // (otherwise copy/paste would clone the guts as loose nodes and the group falls apart).
    this.selection.replaceWith(Array.from(this.graph.nodes()).filter((n) => !this.#hiddenMembers.has(n.id)).map((n) => n.id))
    this.#clearCommentSelection()
    for (const c of this.graph.comments()) {
      this.#selectedComments.add(c.id)
      this.#commentViews.get(c.id)?.setVisualState('selected')
    }
    this.#requestRender()
  }

  /** Delete every selected node along with its incident edges. Each removal goes through
   *  `RemoveNode` so the whole operation is undoable as a single transaction. */
  deleteSelected(): void {
    const ids = this.selection.ids().slice()
    if (ids.length === 0) return
    const removing = new Set(ids)
    this.commandBus.transaction(() => {
      // Reroutes are pure relays — deleting one should heal the wire it carried rather than sever
      // it. Bridge each reroute's upstream feed to its downstream targets before removing it.
      const edges = Array.from(this.graph.edges()) as Edge[]
      for (const id of ids) {
        const node = this.graph.getNode(id)
        if (!node || !isReroute(node)) continue
        for (const bridge of computeRerouteBridges(edges, id, removing)) {
          const edge: Edge = { id: createEdgeId(), from: bridge.from, to: bridge.to }
          // Carry the downstream wire's render opts (colour/type) onto the healed edge.
          const downstream = edges.find((e) => e.from.node === id && e.to.node === bridge.to.node)
          const opts = (downstream && this.#edgeOpts.get(downstream.id)) ?? {}
          this.#edgeOpts.set(edge.id, { ...opts })
          this.commandBus.apply(new ConnectPins(edge))
        }
      }
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
    const comments: Comment[] = []
    const allNodes = [...this.graph.nodes()] as Node[]
    // Selected comments copy WITH their contents: every node geometrically inside each frame.
    // Naïve `for comment { nodesInsideComment(c, allNodes) }` was O(C × N) — on a Ctrl+A of a
    // duplicated graph C and N both grow per copy, melting `copySelection` into O(N²) (~1.7s at
    // 37k nodes). Walk nodes ONCE, check against the selected-comment rects only when the node
    // isn't already in `ids` (Ctrl+A short-circuits everything).
    const selComments: Comment[] = []
    for (const cid of this.#selectedComments) {
      const c = this.graph.getComment(cid)
      if (!c) continue
      comments.push(c as Comment)
      selComments.push(c as Comment)
    }
    if (selComments.length > 0) {
      for (const n of allNodes) {
        if (ids.has(n.id)) continue
        const cx = n.position.x + (n.size ? n.size.x / 2 : 0)
        const cy = n.position.y + (n.size ? n.size.y / 2 : 0)
        for (const c of selComments) {
          if (cx >= c.position.x && cx <= c.position.x + c.size.x &&
              cy >= c.position.y && cy <= c.position.y + c.size.y) { ids.add(n.id); break }
        }
      }
    }
    // A selected macro copies WITH its members (and nested macros' members) so the group can be
    // recreated — otherwise the clone would be an empty wrapper referencing missing nodes.
    for (const id of [...ids]) {
      const n = this.graph.getNode(id)
      if (n && isMacro(n)) {
        const stack = [...macroMembers(n as Node)]
        while (stack.length) {
          const m = stack.pop()!
          if (ids.has(m)) continue
          ids.add(m)
          const mn = this.graph.getNode(m)
          if (mn && isMacro(mn)) stack.push(...macroMembers(mn as Node))
        }
      }
    }
    if (ids.size === 0 && comments.length === 0) return null
    const nodes: Node[] = []
    const renderOpts = new Map<NodeId, RenderNodeOptions>()
    for (const n of this.graph.nodes()) {
      if (!ids.has(n.id)) continue
      nodes.push(n as Node)
      const r = this.#renderOpts.get(n.id)
      if (r) renderOpts.set(n.id, { ...r })
    }
    const rawEdges: Edge[] = []
    const edgeOpts = new Map<EdgeId, RenderEdgeOptions>()
    for (const e of this.graph.edges()) {
      if (!ids.has(e.from.node) || !ids.has(e.to.node)) continue
      rawEdges.push(e as Edge)
      const o = this.#edgeOpts.get(e.id)
      if (o) edgeOpts.set(e.id, { ...o })
    }
    // Drop orphan inline reroutes so the clipboard never carries a dangling dot (an inline reroute
    // with a severed feed/outgoing edge). See pruneOrphanInlineReroutes.
    const { nodes: prunedNodes, edges } = pruneOrphanInlineReroutes(nodes, rawEdges)
    return { nodes: prunedNodes, edges, comments, renderOpts, edgeOpts }
  }

  /** In-process clone of a snapshot. Re-IDs every node/pin/edge, rewires edges to the new pin
   *  IDs, applies as a single transaction (one microtask-batched view sync at the end). */
  #cloneSnapshot(
    snap: ClipboardSnapshot,
    target?: { x: number; y: number } | { dx: number; dy: number },
  ): NodeId[] {
    if (snap.nodes.length === 0 && snap.comments.length === 0) return []
    let translate: { dx: number; dy: number }
    if (target && 'dx' in target) {
      translate = { dx: target.dx, dy: target.dy }
    } else if (target && 'x' in target) {
      // Centroid → target point. Fall back to comment positions when copying a bare frame.
      const pts = snap.nodes.length > 0
        ? snap.nodes.map((n) => n.position)
        : snap.comments.map((c) => c.position)
      let cx = 0, cy = 0
      for (const p of pts) { cx += p.x; cy += p.y }
      cx /= pts.length
      cy /= pts.length
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
    // Remap macro internals to the cloned ids so a pasted/duplicated macro stays a valid collapsed
    // group (members hidden) instead of dissolving into loose nodes referencing the originals.
    //
    // proxyMap entries are also DROPPED when the externalNode wasn't copied — otherwise, expanding
    // the pasted macro later would read those entries and wire the cloned members to the ORIGINAL
    // external nodes (the boundary edge to the external wasn't part of the clipboard, so `findEdge`
    // returns null and `#setMacroCollapsed` just creates a fresh edge from the stale externalNode).
    for (const clone of newNodes) {
      if (!isMacro(clone)) continue
      const members = (clone.state['members'] as NodeId[] | undefined) ?? []
      clone.state['members'] = members.map((m) => nodeIdMap.get(m) ?? m)
      const pm = clone.state['proxyMap'] as MacroProxyRecord[] | undefined
      if (pm) {
        clone.state['proxyMap'] = pm
          .filter((r) => nodeIdMap.has(r.externalNode))
          .map((r) => ({
            ...r,
            macroPin: pinIdMap.get(r.macroPin) ?? r.macroPin,
            memberNode: nodeIdMap.get(r.memberNode) ?? r.memberNode,
            memberPin: pinIdMap.get(r.memberPin) ?? r.memberPin,
            externalNode: nodeIdMap.get(r.externalNode) ?? r.externalNode,
            externalPin: pinIdMap.get(r.externalPin) ?? r.externalPin,
          }))
      }
    }
    const newComments: Comment[] = snap.comments.map((c) => {
      const clone: Comment = {
        ...c,
        id: createCommentId(),
        position: { x: c.position.x + translate.dx, y: c.position.y + translate.dy },
        size: { ...c.size },
      }
      return clone
    })
    this.commandBus.transaction(() => {
      for (const comment of newComments) this.commandBus.apply(new AddComment(comment))
      for (const node of newNodes) this.commandBus.apply(new AddNode(node))
      for (const edge of newEdges) this.commandBus.apply(new ConnectPins(edge))
    })
    this.selection.replaceWith(newNodes.map((n) => n.id))
    if (newComments.length > 0) this.#selectComment(newComments[newComments.length - 1]!.id)
    return newNodes.map((n) => n.id)
  }

  pan(dx: number, dy: number): void { this.#viewport.pan(dx, dy) }

  /** Whether the graph responds to pointer interaction (node drag, selection/marquee, connecting).
   *  When `false` (locked) only viewport pan/zoom stay live and DOM widgets keep working — drag
   *  anywhere to pan without grabbing nodes. Drives the Controls lock toggle. */
  /** Replace the custom connection guard at runtime (or clear with `null`). */
  setIsValidConnection(fn: ((c: ConnectionRequest) => boolean) | null): void { this.#isValidConnection = fn ?? undefined }

  /** Subscribe to a per-frame tick (for a host evaluator/simulation). `cb` gets the frame delta in ms.
   *  Fires every frame between `startLoop()`/`stopLoop()`, and once per `step()`. Returns an
   *  unsubscribe fn. The editor isn't a runtime — this is just a clock the host can drive logic from. */
  onTick(cb: (dtMs: number) => void): () => void {
    this.#tickListeners.add(cb)
    return () => { this.#tickListeners.delete(cb) }
  }

  /** Start the per-frame loop: `onTick` subscribers fire on every animation frame with the real frame
   *  delta. No-op visual cost on its own — rendering still happens on demand when a tick mutates the graph. */
  /** Begin firing `onTick`. Pass `{fps}` to throttle (e.g. `startLoop({fps: 30})` for 30 ticks/s
   *  regardless of the actual frame rate). LiteGraph parity — useful for audio-rate / generative
   *  / simulation nodes where you don't want every browser frame. Omit / pass nothing for the
   *  default "every animation frame" behaviour. */
  startLoop(opts: { fps?: number } = {}): void {
    this.#tickInterval = opts.fps && opts.fps > 0 ? 1000 / opts.fps : 0
    this.#tickAccum = 0
    this.#looping = true
  }
  /** Stop the per-frame loop. `step()` still works while stopped. */
  stopLoop(): void { this.#looping = false }
  get looping(): boolean { return this.#looping }

  /** Fire one tick manually with a fixed delta (default 1/60 s) — deterministic stepping, independent
   *  of the loop. For a host that wants reproducible single-step execution. */
  step(dtMs = 1000 / 60): void { this.#emitTick(dtMs) }

  #emitTick(dtMs: number): void {
    for (const cb of this.#tickListeners) cb(dtMs)
  }

  /** Read-only flatten of a `$templateInstance` into its plain primitive subgraph (fresh ids) for a
   *  host evaluator: `{ nodes, edges, boundary }` where boundary maps each instance pin to the
   *  internal pin(s) it bridges. Recurses through nested instances; returns null if the node isn't an
   *  instance, its definition is unknown, or the template is recursive. The document is NOT mutated. */
  expandTemplateInstance(nodeId: NodeId): FlattenedTemplate | null {
    const node = this.graph.getNode(nodeId)
    if (!node || !isTemplateInstance(node)) return null
    return flattenTemplateInstance(
      node as Node,
      (id) => this.#definitions.get(id),
      { node: createNodeId, pin: createPinId, edge: createEdgeId },
    )
  }

  /** A plain structural snapshot of the displayed graph for a host interpreter — `{ nodes, edges }`
   *  with no PIXI/view data. With `{ expandMacros: true }` collapsed macros are flattened to their
   *  primitives (proxy-pin edges remapped to member pins) so the executor sees one flat graph and the
   *  grouping stays purely visual. Read-only; does not mutate the document. */
  graphSnapshot(opts?: { expandMacros?: boolean; expandTemplates?: boolean }): GraphSnapshot {
    const rawNodes = [...this.graph.nodes()] as Node[]
    const rawEdges = [...this.graph.edges()] as Edge[]
    let { nodes, edges } = opts?.expandMacros
      ? flattenMacroProxies(rawNodes, rawEdges)
      : { nodes: rawNodes, edges: rawEdges }
    if (opts?.expandTemplates) {
      ({ nodes, edges } = flattenAllTemplateInstances(
        nodes, edges,
        (id: TemplateDefId) => this.#definitions.get(id),
        { node: createNodeId, pin: createPinId, edge: createEdgeId },
      ))
    }
    return {
      nodes: nodes.map((n) => ({
        id: String(n.id),
        type: n.type,
        state: { ...n.state },
        pins: n.pins.map((p) => ({
          id: String(p.id), kind: p.kind, direction: p.direction, type: String(p.type),
          ...(p.default !== undefined ? { default: p.default } : {}),
          ...(p.multiple ? { multiple: true } : {}),
        })),
      })),
      edges: edges.map((e) => ({
        from: { node: String(e.from.node), pin: String(e.from.pin) },
        to: { node: String(e.to.node), pin: String(e.to.pin) },
      })),
    }
  }

  /** Toggle an edge's animated wire flow. Public, non-undoable tweak (animation is a transient view
   *  state). Works for virtualized edges with no live record too. */
  setEdgeAnimated(edgeId: EdgeId, animated: boolean): void {
    if (!this.graph.hasEdge(edgeId)) return
    const opts = { ...(this.#edgeOpts.get(edgeId) ?? {}), animated }
    this.#edgeOpts.set(edgeId, opts)
    if (animated) this.#animatedEdges.add(edgeId); else this.#animatedEdges.delete(edgeId)
    const rec = this.#edgeRecords.get(edgeId)
    if (rec) { rec.opts = opts; rec.lastFromX = rec.lastFromY = rec.lastToX = rec.lastToY = undefined; this.#redrawEdge(edgeId) }
    this.#requestRender()
  }

  /** Replace a node's pins at runtime (variadic pins — Sequence/MakeArray "+", Branch true/false).
   *  Undoable; edges to dropped pins are pruned; the node view refits to the new pin list. */
  setNodePins(nodeId: NodeId, pins: Pin[]): void {
    if (!this.graph.getNode(nodeId)) return
    this.commandBus.apply(new SetNodePins(nodeId, pins))
    // Pins changed (count/labels) → drop the stale size so the rebuilt view refits to the new pins.
    delete (this.graph.getNode(nodeId) as { size?: unknown }).size
    this.#rerenderNode(nodeId)
    this.#requestRender()
  }

  /** Replace a node's widget list wholesale — the dual of `setNodePins`, used by runtime plugins
   *  to synthesise widgets in response to schema changes (e.g. when a Schema node wires into a
   *  Struct, the plugin uses `setNodePins` + `setNodeWidgets` to derive both a pin and a
   *  pinKey-bound default-value widget per field). Undoable. Preserves `node.state[w.key]` — a
   *  re-add under the same key restores its prior value. */
  setNodeWidgets(nodeId: NodeId, widgets: WidgetSpec[] | undefined): void {
    if (!this.graph.getNode(nodeId)) return
    this.commandBus.apply(new SetNodeWidgets(nodeId, widgets))
    // Widget set changed (count/heights) → drop the stale size so the view refits + DOM widgets sync.
    delete (this.graph.getNode(nodeId) as { size?: unknown }).size
    this.#rerenderNode(nodeId)
    this.#syncDomWidgets()
    this.#requestRender()
  }

  /** Show a coloured status ring on a node (`running` pulses, `ok`/`error` are solid, `idle` clears).
   *  For surfacing graph-execution progress from the host — the editor isn't a runtime. */
  setNodeStatus(nodeId: NodeId, status: NodeStatus): void {
    if (status === 'idle') this.#nodeStatus.delete(nodeId)
    else this.#nodeStatus.set(nodeId, status)
    this.#requestRender()
  }

  /** Remove every node and edge and drop the undo/redo history — a fast, allocation-light reset (no
   *  per-node commands, no selection glow). The right way to empty a large graph. */
  clear(): void {
    this.#clearAll()
    this.commandBus.clearHistory()
    this.#scheduleMinimapSync()
    this.#requestRender()
    this.#events.emit('graph:loaded', { nodeCount: 0, edgeCount: 0 })
    this.#events.emit('history:changed', { canUndo: false, canRedo: false })
  }

  /** Clear every node status ring. */
  clearNodeStatuses(): void {
    if (this.#nodeStatus.size === 0) return
    this.#nodeStatus.clear()
    this.#requestRender()
  }

  #drawStatuses(): void {
    const g = this.#statusGfx
    if (!g) return
    g.clear()
    if (this.#nodeStatus.size === 0) return
    const accent = this.#theme.tokens.color.widget.fill
    const colorFor = (s: NodeStatus): string => (s === 'running' ? accent : s === 'ok' ? '#39d98a' : s === 'error' ? '#ff5b6e' : '')
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 140)
    let animating = false
    for (const [id, status] of this.#nodeStatus) {
      const view = this.#views.get(id)
      const node = this.graph.getNode(id)
      const color = colorFor(status)
      if (!view || !node || !color) continue
      // Skip nodes whose view is hidden (collapsed-macro members, expanded-macro placeholder).
      // Without this the status ring keeps painting at the last known container position,
      // leaving an orphan rectangle on the canvas — see step-debugger demo ghost bug.
      if (!view.container.visible) continue
      const size = node.size ?? { x: this.#theme.tokens.geometry.node.minWidth, y: 40 }
      const pad = 3
      const alpha = status === 'running' ? pulse : 0.95
      const width = status === 'running' ? 3 : 2.5
      // Concentric with the node body: ring radius = node corner radius + pad, so the rounded
      // corners stay parallel and the node's corners never poke outside the ring.
      const radius = this.#theme.tokens.geometry.node.radius + pad
      g.roundRect(view.container.x - pad, view.container.y - pad, size.x + pad * 2, size.y + pad * 2, radius)
        .stroke({ color, width, alpha })
      if (status === 'running') animating = true
    }
    if (animating) this.#requestRender()  // keep the pulse alive
  }

  /** Built-in type check + the optional user `isValidConnection` guard, against the two pins. */
  #connectionAllowed(sourceNode: Node, sourcePin: Pin, targetNode: Node, targetPin: Pin): boolean {
    if (!canConnect(sourcePin, targetPin, sourceNode.id === targetNode.id, {
      sourceEdges: this.#countEdgesAtPin(sourceNode.id, String(sourcePin.id)),
      targetEdges: this.#countEdgesAtPin(targetNode.id, String(targetPin.id)),
      types: this.#types,
    })) return false
    if (this.#isValidConnection) {
      const out = sourcePin.direction === 'out'
      const oN = out ? sourceNode : targetNode, oP = out ? sourcePin : targetPin
      const iN = out ? targetNode : sourceNode, iP = out ? targetPin : sourcePin
      if (!this.#isValidConnection({ source: oN.id, sourcePin: oP.id as PinId, target: iN.id, targetPin: iP.id as PinId })) return false
    }
    return true
  }

  get interactive(): boolean { return this.#interactive }
  setInteractive(interactive: boolean): void {
    this.#interactive = interactive
    // DOM-mounted widgets are real DOM above the canvas, so the WebGL gate above can't stop them —
    // toggle their pointer events directly so a locked graph freezes framework widgets too.
    for (const rec of this.#domWidgets.values()) rec.el.style.pointerEvents = interactive ? 'auto' : 'none'
  }

  /** G12 — Live Mode (LiteGraph parity). Freezes all interaction (`setInteractive(false)`) and
   *  hides editor-managed chrome (breadcrumb). Per-node rendering, plugin runtimes and animated
   *  edges keep ticking — the graph still LIVES, you just can't edit it. The overlay root gets
   *  `data-xeno-live="true"` so hosts can hide their own panels via CSS. Fires `livemode:changed`. */
  setLiveMode(live: boolean): void {
    if (this.#liveMode === live) return
    this.#liveMode = live
    this.setInteractive(!live)
    this.overlayRoot.setAttribute('data-xeno-live', live ? 'true' : 'false')
    this.#updateBreadcrumb()                                 // breadcrumb auto-hides in live mode
    this.#events.emit('livemode:changed', { live })
  }
  get liveMode(): boolean { return this.#liveMode }
  #liveMode = false
  zoomAt(focal: { x: number; y: number }, factor: number): void {
    this.#viewport.zoomAt(focal, factor, this.#zoomBounds)
  }
  resetView(): void { this.#viewport.reset() }

  /**
   * Frame the whole graph: compute the world-space AABB of every node and set the viewport so it
   * sits centred inside the canvas with `padding` px of margin. No-op on an empty graph. `maxZoom`
   * defaults to 1 so small graphs aren't blown up; `minZoom` defaults to the editor's zoom floor.
   */
  fitView(opts: { padding?: number; maxZoom?: number; minZoom?: number } = {}): void {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let count = 0
    for (const node of this.graph.nodes()) {
      const b = nodeBounds(node, this.#theme.tokens)
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y)
      maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height)
      count++
    }
    if (count === 0) return
    this.#viewport.setState(
      fitView(
        { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
        { width: Math.max(1, this.#app.screen.width), height: Math.max(1, this.#app.screen.height) },
        { padding: opts.padding ?? 64, maxZoom: opts.maxZoom ?? 1, minZoom: opts.minZoom ?? this.#zoomBounds[0] },
      ),
    )
  }

  get viewport(): ViewportState { return this.#viewport.state }
  /** How many nodes currently have a live PIXI view. With virtualization (#59) on a large graph this
   *  stays O(visible) — far below `graph.nodeCount` — which is what keeps GPU memory bounded. */
  get renderedNodeCount(): number { return this.#views.size }
  /** Set the viewport (pan/zoom) directly. */
  setViewport(state: ViewportState): void { this.#viewport.setState(state) }
  /** Convert a point in host/screen pixels (relative to the canvas top-left) to world coordinates —
   *  e.g. to spawn a node where the user dropped something. */
  screenToWorld(point: { x: number; y: number }): { x: number; y: number } { return screenToWorld(point, this.#viewport.state) }
  /** Convert a world-space point to host/screen pixels — e.g. to anchor a DOM overlay to a node. */
  worldToScreen(point: { x: number; y: number }): { x: number; y: number } { return worldToScreen(point, this.#viewport.state) }
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
    clearGradientCache()
    for (const tex of this.#bakeCache.values()) tex.destroy(true)
    this.#bakeCache.clear()

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
      this.#updateGrid()
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
    // Comments + macro frames are theme-rendered too (geometry.comment, typography.comment, accent) —
    // rebuild with the new tokens, otherwise they keep the previous theme's look in the new theme.
    for (const v of this.#commentViews.values()) v.destroy()
    this.#commentViews.clear()
    for (const f of this.#macroFrames.values()) f.destroy()
    this.#macroFrames.clear()
    this.#syncComments()
    this.#applyMacroVisibility() // re-hide collapsed members + rebuild expanded frames in the new theme
    this.#updateVisualStates()
    // Refresh DOM widget hosts' --xeno-* CSS vars (and their controllers) for the new theme.
    this.#syncDomWidgets()
    // Edges re-paint themselves through the ticker via #drawEdge — no explicit pass needed.
    this.#palette?.setStyle(next.paletteStyle)
    this.#edgeMenu?.setStyle(next.paletteStyle)
    this.#widgetOverlay?.setStyle(next.paletteStyle)
    this.#minimap?.setStyle(next.tokens)
    this.#applyThemeVars()
    this.#styleOverlay()
    this.#requestRender()
  }

  destroy(): void {
    this.#looping = false
    this.#tickListeners.clear()
    this.#pluginHost.dispose()
    window.removeEventListener('keydown', this.#onKeyDown)
    window.removeEventListener('resize', this.#onResize)
    this.#hostResizeObserver?.disconnect()
    ;(this.#app.canvas as HTMLCanvasElement | undefined)?.removeEventListener('dblclick', this.#onDoubleClick)
    ;(this.#app.canvas as HTMLCanvasElement | undefined)?.removeEventListener('contextmenu', this.#onContextMenu)
    ;(this.#app.canvas as HTMLCanvasElement | undefined)?.removeEventListener('pointerdown', this.#onRightDown)
    ;(this.#app.canvas as HTMLCanvasElement | undefined)?.removeEventListener('pointerup',   this.#onRightUp)
    ;(this.#app.canvas as HTMLCanvasElement | undefined)?.removeEventListener('dragover',    this.#onDragOver)
    ;(this.#app.canvas as HTMLCanvasElement | undefined)?.removeEventListener('drop',        this.#onDrop)
    this.#palette?.destroy()
    this.#interaction?.detach()
    if (this.#freezeTimer) clearTimeout(this.#freezeTimer)
    for (const rec of this.#domWidgets.values()) { rec.cleanup?.(); rec.controller.unmount?.(); rec.el.remove() }
    this.#domWidgets.clear()
    this.#controls?.destroy()
    this.#minimap?.destroy()
    this.#overlayRoot?.remove()
    this.#overlayRoot = null
    this.#freezeRT?.destroy(true)
    this.#backdropRT?.destroy(true)
    this.#destroyed = true
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

    // User-registered commands run FIRST so a host that binds `Cmd+Shift+C` for "Copy with
    // comment" can override (or co-exist with) anything Xenolith does. If the registry's match
    // executes, swallow the event so we don't also fire a built-in shortcut on the same chord.
    const matched = this.#commands.lookupByHotkey(e)
    if (matched) {
      e.preventDefault()
      matched.execute()
      return
    }

    const mod = e.metaKey || e.ctrlKey

    if (!mod && e.key === '`') {
      e.preventDefault()
      this.toggleStats()
      return
    }
    if (!mod && e.key === 'Tab') {
      e.preventDefault()
      if (this.isPaletteOpen) this.closePalette()
      else this.openPalette()
      return
    }
    if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
      if (this.#selectedComments.size > 0) {
        e.preventDefault()
        const ids = [...this.#selectedComments]
        this.#clearCommentSelection()
        this.commandBus.transaction(() => { for (const id of ids) this.removeComment(id) })
        // Fall through to also delete any selected nodes; bail only if there are none.
      }
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
    if (mod && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault()
      this.selectAll()
      return
    }
    if (mod && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault()
      this.duplicateSelected()
      return
    }
    if (mod && (e.key === 'g' || e.key === 'G')) {
      // Cmd/Ctrl+G — Collapse the selection into an in-place macro. With Shift — convert it into a
      // reusable Template instance instead (one shared definition, dive-in to edit).
      if (this.selection.size === 0) return
      e.preventDefault()
      if (e.shiftKey) this.createTemplateFromSelection()
      else this.createMacroFromSelection()
      return
    }
    if (mod && (e.key === 'c' || e.key === 'C')) {
      // A bare comment selection (no nodes) is still copyable — it carries its contents.
      if (this.selection.size === 0 && this.#selectedComments.size === 0) return
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

  /** The node's CURRENT rendered (view) position — equals `node.position` at rest, but during a drag
   *  it's the live cursor-follow position (ahead of the not-yet-committed `node.position`). Null if the
   *  node has no live view (virtualized off-screen). Handy for anchoring DOM overlays to a node. */
  renderedNodePosition(nodeId: NodeId): { x: number; y: number } | null {
    return this.#livePosition(nodeId)
  }

  /** Is this node's view currently DRAWN on the canvas? Returns:
   *   - `true`  — view exists AND its container is visible (a viewer would see it),
   *   - `false` — view exists but is hidden (typically a macro member when its macro is collapsed),
   *   - `null`  — no view at all (off-screen under virtualisation, or never materialised).
   *  Designed for e2e introspection: tests can assert "macro members must NOT be visible after
   *  paste" without poking at private state. Cheap (Map lookup + bool read). */
  isNodeRendered(nodeId: NodeId): boolean | null {
    const view = this.#views.get(nodeId)
    if (!view) return null
    return view.container.visible === true
  }

  #pinLayoutFor(node: Node, pinIndex: number): PinLayout {
    const g = this.#theme.tokens.geometry
    const layout = computeNodeLayout(node, {
      node:   g.node,
      pin:    { diameter: g.pin.diameter, rowSpacing: g.pin.rowSpacing, rowHeight: g.pin.rowHeight },
      header: { toPinsGap: g.header.toPinsGap },
      widget: { rowHeight: g.widget.rowHeight, gap: g.widget.gap, controlMinWidth: g.widget.controlMinWidth },
    }, (k) => this.#isPinConnected(node.id, k))
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
    // pinLocalPosition shifts each animation frame. Animated edges never skip — they must redraw
    // each frame for the flowing dash.
    if (
      !rec.opts.animated &&
      rec.lastFromX === fromPos.x && rec.lastFromY === fromPos.y &&
      rec.lastToX   === toPos.x   && rec.lastToY   === toPos.y
    ) return
    if (rec.opts.animated) rec.opts.dashPhase = this.#dashPhase
    this.#drawEdge(rec.graphics, fromPos, toPos, rec.opts)
    this.#updateEdgeLabel(rec, fromPos, toPos)
    rec.lastFromX = fromPos.x
    rec.lastFromY = fromPos.y
    rec.lastToX   = toPos.x
    rec.lastToY   = toPos.y
  }

  /** Create / update / drop an edge's midpoint label Text from `rec.opts.label`. The label rides the
   *  world layer so it pans and zooms with the wire. */
  #updateEdgeLabel(rec: EdgeRecord, from: PinLayout, to: PinLayout): void {
    const text = rec.opts.label
    if (!text) {
      if (rec.label) { rec.label.parent?.removeChild(rec.label); rec.label.destroy(); rec.label = undefined }
      return
    }
    const tokens = this.#theme.tokens
    if (!rec.label) {
      rec.label = new Text({
        text,
        style: {
          fontFamily: tokens.typography.fontFamily,
          fontSize: 12,
          fill: tokens.color.text.primary,
          stroke: { color: tokens.color.surface.canvas, width: 4 },
          align: 'center',
        },
      })
      rec.label.eventMode = 'none'
      rec.label.anchor.set(0.5)
      this.#edgesLayer.addChild(rec.label)
    } else if (rec.label.text !== text) {
      rec.label.text = text
    }
    const mid = bezierMidpoint(computeEdgePath(from, to, tokens.geometry.edge))
    rec.label.position.set(mid.x, mid.y)
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
    if (rec.label) { rec.label.parent?.removeChild(rec.label); rec.label.destroy() }
    this.#animatedEdges.delete(edgeId)
    this.#edgeRecords.delete(edgeId)
  }

  /** Materialise an edge's Graphics from the model. Used by `connect()`, `#loadEdge()`, and the
   *  command-driven sync path. Resolves pin layouts and writes an EdgeRecord into `#edgeRecords`.
   *  Returns false if either endpoint is missing (stale edge in the model). */
  #materializeEdge(edge: Edge, opts: RenderEdgeOptions): boolean {
    const fromNode = this.graph.getNode(edge.from.node)
    const toNode   = this.graph.getNode(edge.to.node)
    if (!fromNode || !toNode) return false
    // Resolve via the live NodeView so non-layout pin geometry (reroute knots, collapsed pills)
    // attaches correctly; falls back to computeNodeLayout when a view isn't mounted yet.
    const fromPin = this.#pinWorldPosition(fromNode, String(edge.from.pin))
    const toPin   = this.#pinWorldPosition(toNode,   String(edge.to.pin))
    if (!fromPin || !toPin) return false
    // Default the wire colour to the source pin's type when the host didn't specify one, so a
    // typed wire is never drawn grey just because opts omitted sourceType.
    let resolved = opts
    if (resolved.sourceType === undefined) {
      const sp = (fromNode as Node).pins.find((p) => String(p.id) === String(edge.from.pin))
      if (sp) resolved = { ...resolved, sourceType: String(sp.type) }
    }
    const gfx = this.#renderEdge(fromPin, toPin, resolved)
    this.#edgesLayer.addChild(gfx)
    this.#edgeRecords.set(edge.id, { edge, graphics: gfx, opts: resolved })
    this.#edgeOpts.set(edge.id, resolved)
    if (resolved.animated) this.#animatedEdges.add(edge.id)
    return true
  }

  /** Update an edge's render options (label / arrowhead marker / animated flow / wire colour).
   *  Merges over the existing options, repaints, and persists through serialization. */
  setEdgeOptions(edgeId: EdgeId, opts: Partial<RenderEdgeOptions>): void {
    const rec = this.#edgeRecords.get(edgeId)
    if (!rec) return
    rec.opts = { ...rec.opts, ...opts }
    this.#edgeOpts.set(edgeId, rec.opts)
    if (rec.opts.animated) this.#animatedEdges.add(edgeId)
    else this.#animatedEdges.delete(edgeId)
    // Force a repaint even if endpoints are unchanged (label/marker/colour may have changed).
    rec.lastFromX = rec.lastFromY = rec.lastToX = rec.lastToY = undefined
    this.#redrawEdge(edgeId)
    this.#requestRender()
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
    // Node positions/membership may have changed (drag commit, delete, paste) — refresh the spatial
    // grid + edge index once so culling queries stay correct. O(N) but only on edits, never per frame.
    this.#rebuildSpatialGrid()
    this.#rebuildEdgeIndex()
    // Virtualization: past the threshold, only nodes near the viewport get a live view. A node is
    // wanted if it's in the inner (create) band, or already live and still in the outer (keep) band
    // — the hysteresis that avoids churn. Off-screen nodes drop their view but stay as graph data.
    const virtualize = this.#virtualizeActive()
    const bands = virtualize ? this.#virtualizeBands() : null
    const seenNodes = new Set<NodeId>()
    for (const node of this.graph.nodes()) {
      seenNodes.add(node.id)
      const live = this.#views.has(node.id)
      let want = true
      if (bands) {
        const b = nodeBounds(node as Node, this.#theme.tokens)
        want = live ? rectIntersects(b, bands.outer) : rectIntersects(b, bands.inner)
      }
      if (!want) {
        if (live) this.#destroyViewOffscreen(node.id) // left the band — view goes, data stays
        continue
      }
      this.#ensureView(node as Node) // creates if missing, refreshes position otherwise
    }
    let droppedFromSelection = false
    for (const [id, view] of Array.from(this.#views)) {
      if (seenNodes.has(id)) continue
      view.container.destroy({ children: true })
      this.#views.delete(id)
      if (this.selection.contains(id)) droppedFromSelection = true
      this.#marqueeHovered.delete(id)
      if (this.#hoveredId === id) this.#hoveredId = null
      // A removed node must not keep a status ring — otherwise a deleted "running" node stays lit.
      this.#nodeStatus.delete(id)
    }
    if (droppedFromSelection) {
      this.selection.replaceWith(this.selection.ids().filter((id) => seenNodes.has(id)))
    }

    if (this.#virtualizeActive()) {
      // Edges are virtualized too: only those incident to a live node get Graphics (full level);
      // in sprite/flat the LOD batch draws them, so no per-edge records.
      if (this.#lodLevel === 'full') this.#cullEdges()
    } else {
      // Small graph — materialise every edge (the original 1:1 path).
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

    this.#propagateRerouteTypes()
    // Newly materialised views must reflect current selection immediately (e.g. a node inserted +
    // selected in the same tick) — the selection change fired before its view existed, and
    // render-on-demand won't repaint on its own.
    this.#updateVisualStates()
    this.#syncComments() // keep comment frames in sync on every mutation (incl. undo/redo)
    this.#applyMacroVisibility() // hide members of collapsed macros (incl. undo/redo)
    this.#syncDomWidgets()
    this.#scheduleMinimapSync()
    // If a graph edit lands while zoomed out, refresh whatever batch the current LOD level draws.
    if (this.#lodLevel !== 'full') {
      this.#lodLayer.removeChildren().forEach((c) => c.destroy())
      this.#lodLayer.addChild(this.#buildLODEdges())
      if (this.#lodLevel === 'flat') this.#lodLayer.addChild(this.#buildLODNodes())
    }
    this.#requestRender()
  }

  /** Rebuild a single node's view in place (e.g. after its pin types changed). Preserves position,
   *  collapse state and selection. */
  /** Pin ids on `nodeId` that currently have at least one edge attached. Drives the exec-pin paint
   *  via {@link RenderNodeOptions.connectedPinIds}. Cheap — reads the per-node edge index. */
  #connectedPinIdsFor(nodeId: NodeId): Set<string> {
    const out = new Set<string>()
    for (const eid of this.#edgesByNode.get(nodeId) ?? []) {
      const e = this.graph.getEdge(eid as EdgeId)
      if (!e) continue
      if (e.from.node === nodeId) out.add(String(e.from.pin))
      if (e.to.node === nodeId)   out.add(String(e.to.pin))
    }
    return out
  }

  #rerenderNode(id: NodeId): void {
    const node = this.graph.getNode(id)
    const oldView = this.#views.get(id)
    if (!node || !oldView) return
    const opts = { ...(this.#renderOpts.get(id) ?? {}), collapsed: oldView.isCollapsed() }
    const newView = this.#renderNode(node as Node, opts)
    this.#nodesLayer.removeChild(oldView.container)
    oldView.container.destroy({ children: true })
    this.#views.set(id, newView)
    this.#nodesLayer.addChild(newView.container)
    this.#wireNodeInteraction(id, newView)
  }

  /** Propagate wire types through reroutes: a reroute adopts the type of whatever feeds its input,
   *  on both pins, so its dot/box colour, its output pin, and its outgoing wires all match the
   *  incoming wire (no colour mismatch / confusion). Cascades through reroute chains. Cheap no-op
   *  when nothing changed (e.g. freshly imported graphs already carry resolved types). */
  #propagateRerouteTypes(): void {
    // Index topology once; types are read live from the pins as the fixpoint iterates.
    const incoming = new Map<NodeId, Edge>()
    const outgoing = new Map<NodeId, Edge[]>()
    for (const e of this.graph.edges()) {
      incoming.set(e.to.node, e as Edge)
      const arr = outgoing.get(e.from.node); if (arr) arr.push(e as Edge); else outgoing.set(e.from.node, [e as Edge])
    }
    const reroutes: Node[] = []
    const boundaries: Node[] = []
    for (const n of this.graph.nodes()) {
      if (isReroute(n) || n.type === REROUTE_NODE_TYPE) reroutes.push(n as Node)
      else if (isTemplateBoundary(n)) boundaries.push(n as Node)
    }
    if (reroutes.length === 0 && boundaries.length === 0) return

    let changed = true
    let guard = 0
    while (changed && guard++ < 16) {
      changed = false
      // Template boundary nodes are wildcard relays too: a `$templateInput` adopts the type of the
      // member IN-pin it feeds (downstream), a `$templateOutput` the type of the member OUT-pin that
      // feeds it (upstream). So the interface type is driven by the definition's own wiring; the
      // instance picks it up via templateInterface on dive-out. (See [generic-templates] for the
      // deferred per-instance variant.)
      for (const node of boundaries) {
        if (node.type === TEMPLATE_INPUT_TYPE) {
          const outPin = node.pins.find((p) => p.direction === 'out')
          if (!outPin) continue
          let type = 'any'
          for (const e of outgoing.get(node.id) ?? []) {
            const tn = this.graph.getNode(e.to.node)
            const tp = tn?.pins.find((p) => String(p.id) === String(e.to.pin))
            if (tp && String(tp.type) !== 'any') { type = String(tp.type); break }
          }
          if (String(outPin.type) === type) continue
          outPin.type = type
          changed = true
          this.#rerenderNode(node.id)
          for (const e of outgoing.get(node.id) ?? []) {
            const opts = { ...(this.#edgeOpts.get(e.id) ?? {}), sourceType: type }
            this.#edgeOpts.set(e.id, opts)
            const rec = this.#edgeRecords.get(e.id); if (rec) rec.opts = opts
            this.#redrawEdge(e.id)
          }
        } else {
          const inPin = node.pins.find((p) => p.direction === 'in')
          if (!inPin) continue
          let type = 'any'
          const feed = incoming.get(node.id)
          if (feed) {
            const sn = this.graph.getNode(feed.from.node)
            const sp = sn?.pins.find((p) => String(p.id) === String(feed.from.pin))
            if (sp) type = String(sp.type)
          }
          if (String(inPin.type) === type) continue
          inPin.type = type
          changed = true
          this.#rerenderNode(node.id)
        }
      }
      for (const node of reroutes) {
        const inPin = node.pins.find((p) => p.direction === 'in')
        const outPin = node.pins.find((p) => p.direction === 'out')
        if (!inPin || !outPin) continue
        const feed = incoming.get(node.id)
        let type = 'any'
        if (feed) {
          const sn = this.graph.getNode(feed.from.node)
          const sp = sn?.pins.find((p) => String(p.id) === String(feed.from.pin))
          if (sp) type = String(sp.type)
        }
        if (String(inPin.type) === type && String(outPin.type) === type) continue
        inPin.type = type
        outPin.type = type
        changed = true
        this.#rerenderNode(node.id)
        for (const e of outgoing.get(node.id) ?? []) {
          const opts = { ...(this.#edgeOpts.get(e.id) ?? {}), sourceType: type }
          this.#edgeOpts.set(e.id, opts)
          const rec = this.#edgeRecords.get(e.id)
          if (rec) rec.opts = opts
          this.#redrawEdge(e.id)
        }
      }
    }
    if (guard > 1) this.#requestRender()
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
      // Locked (non-interactive): no connecting, no marquee, no selection — only viewport pan (RMB)
      // stays live, so you can drag anywhere without grabbing the graph.
      if (!this.#interactive) return
      this.#requestRender()
      // A click that reaches the stage (empty canvas / node, not a comment header) drops comment
      // selection — the comment's own header pointerdown stops propagation before this runs.
      if (this.#selectedComments.size > 0) { this.#clearCommentSelection(); this.#requestRender() }
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
      // Click-outside: a click on empty canvas while a macro is expanded collapses the innermost open
      // one (the frame body captures clicks inside it, so reaching the stage means truly outside).
      const openMacro = this.#deepestExpandedMacro()
      if (openMacro) { this.collapseMacro(openMacro); return }
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
      this.#lastPointerScreen = current
      this.#lastPointerWorld = screenToWorld(current, this.#viewport.state)
      if (this.#commentDrag) { this.#updateCommentDrag(current); return }
      // Edge midpoint hover affordance — only while fully idle (no drag / marquee).
      if (this.#dragState.kind === 'idle' && marquee.kind === 'idle') {
        this.#updateEdgeMidpointHover(this.#lastPointerWorld)
      } else if (this.#hoveredEdgeMid) {
        this.#hoveredEdgeMid = null
        this.#edgeHoverGfx.clear()
      }
      // Note: no blanket requestRender here. Bare cursor movement over the canvas changes
      // nothing on screen — hover transitions repaint via the node pointerover/pointerout
      // handlers. We only mark dirty inside the branches that actually mutate visuals (active
      // drag, pin-drag ghost, marquee rect).

      if (this.#dragState.kind === 'pin-drag') {
        const target = readPinHandle(e.target)
        this.#updatePinDrag(current, target)
        this.#requestRender()
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
        this.#requestRender()
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
          if (this.#hiddenMembers.has(node.id)) continue // hidden members of a collapsed macro aren't selectable
          if (rectIntersects(rect, nodeBounds(node, this.#theme.tokens))) {
            this.#marqueeHovered.add(node.id)
          }
        }
        this.#updateVisualStates()
        this.#requestRender()
      }
    })

    const endStage = (e: FederatedPointerEvent): void => {
      this.#requestRender()
      if (this.#commentDrag) {
        this.#endCommentDrag({ x: e.global.x, y: e.global.y })
        return
      }
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
        if (this.#hiddenMembers.has(node.id)) continue // hidden members of a collapsed macro aren't selectable
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
      this.#requestRender()
    })
    view.container.on('pointerout', () => {
      if (this.#hoveredId === id) this.#hoveredId = null
      this.#updateVisualStates()
      this.#requestRender()
    })
    view.container.on('pointerdown', (e: FederatedPointerEvent) => {
      if (e.button !== 0) return
      if (readPinHandle(e.target)) return
      // Locked: nothing on the node responds — no widget edit, no select, no drag (pan stays live).
      if (!this.#interactive) return
      // Modal macro: while a macro is expanded, only its (transitive) members are interactive. A click
      // on any node outside the open macro is a click-outside → collapse it and consume the event.
      const openMacro = this.#deepestExpandedMacro()
      if (openMacro && !this.#macroIsAncestor(openMacro, id)) {
        this.collapseMacro(openMacro)
        e.stopPropagation()
        return
      }
      // Widget interaction pre-empts node drag: hit-test the pointer against this node's widgets.
      if (view.widgetHit) {
        const local = e.getLocalPosition(view.container)
        const hit = view.widgetHit(local.x, local.y)
        if (hit && this.#onWidgetPointerDown(id, view, hit, e)) {
          e.stopPropagation()
          return
        }
      }
      // Raise the interacted node to the top of ITS layer (a macro member lives in the overlay layer,
      // not #nodesLayer — using the wrong layer would throw and break the drag).
      const layer = view.container.parent ?? this.#nodesLayer
      layer.setChildIndex(view.container, layer.children.length - 1)
      // Pre-click veto (H7) — plugin can cancel the click and prevent selection + drag init.
      if (!firePreventable(this.#events, 'node:clicking', { nodeId: id })) return
      if (!this.selection.contains(id)) {
        this.selection.select(id, e.shiftKey ? 'toggle' : 'replace')
      }
      this.#events.emit('node:click', { nodeId: id })
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

  /** Handle a pointerdown that landed on a widget. Returns true if the gesture was consumed.
   *  Toggle/button act immediately; slider/number begin a live drag committed on pointerup;
   *  combo/text defer to the DOM overlay (wired in a later slice). */
  #onWidgetPointerDown(nodeId: NodeId, view: NodeView, hit: WidgetHit, e: FederatedPointerEvent): boolean {
    const node = this.graph.getNode(nodeId)
    if (!node) return false
    const { spec, rect } = hit
    // Display-mode widgets (visibility:'always' bound to a wired IN-pin) show LIVE upstream
    // values — editing makes no sense, the next live update would just overwrite the change.
    // Swallow the pointer so it doesn't open the DOM overlay; selection / drag bubble normally.
    if (this.#isDisplayModeWidget(node as Node, spec)) return false
    switch (spec.type) {
      case 'toggle':
        this.setWidgetValue(nodeId, spec.id, !widgetValue(node, spec))
        return true
      case 'button':
        this.#events.emit('widget:action', { nodeId, widgetId: spec.id, action: spec.action })
        return true
      case 'slider':
      case 'number': {
        this.#beginWidgetDrag(nodeId, view, spec, rect, e)
        return true
      }
      case 'text':
        // Defer past the current pointer gesture: opening (and focusing) a DOM field mid-pointerdown
        // gets blurred immediately by the in-flight gesture, instantly committing + closing it.
        setTimeout(() => this.#openWidgetTextEditor(nodeId, spec, rect), 0)
        return true
      case 'combo':
        setTimeout(() => this.#openWidgetCombo(nodeId, spec, rect), 0)
        return true
      case 'color':
        // Open synchronously, inside the user gesture — the OS colour picker only opens from a
        // real gesture, and deferring also mis-anchored it to the window origin on first click.
        this.#openWidgetColor(nodeId, spec, rect)
        return true
      case 'custom': {
        // DOM-mounted custom widgets receive their own native pointer events; only canvas-draw ones
        // forward through the editor.
        const ctrl = this.#widgetControllers.get(spec.renderer)
        if (ctrl && !isDomWidgetController(ctrl) && ctrl.onPointer) {
          this.#beginCustomWidgetDrag(nodeId, view, spec, rect, ctrl, e)
        }
        return true
      }
      default:
        return true
    }
  }

  #ensureWidgetOverlay(): WidgetOverlay {
    if (!this.#widgetOverlay) this.#widgetOverlay = new WidgetOverlay(this.#host, this.#theme.paletteStyle)
    return this.#widgetOverlay
  }

  /** Screen-space rect for a node-local widget rect, accounting for the current viewport. */
  #widgetScreenRect(nodeId: NodeId, rect: { x: number; y: number; width: number; height: number }): OverlayRect | null {
    const node = this.graph.getNode(nodeId)
    if (!node) return null
    const vp = this.#viewport.state
    return {
      x: (node.position.x + rect.x) * vp.zoom + vp.x,
      y: (node.position.y + rect.y) * vp.zoom + vp.y,
      width: rect.width * vp.zoom,
      height: rect.height * vp.zoom,
    }
  }

  #openWidgetTextEditor(
    nodeId: NodeId, spec: Extract<WidgetSpec, { type: 'text' | 'number' }>,
    rect: { x: number; y: number; width: number; height: number },
  ): void {
    const screen = this.#widgetScreenRect(nodeId, rect)
    const node = this.graph.getNode(nodeId)
    if (!screen || !node) return
    const zoom = this.#viewport.state.zoom
    const r = resolveWidgetStyle(this.#theme.tokens, spec.style)
    // Labelled text renders the label on a row above the field box — drop the DOM editor below it.
    if (spec.type === 'text' && spec.label.length > 0) {
      const labelH = this.#theme.tokens.geometry.widget.rowHeight * zoom
      screen.y += labelH
      screen.height -= labelH
    }
    this.#ensureWidgetOverlay().editText({
      rect: screen,
      value: String(widgetValue(node, spec) ?? ''),
      multiline: spec.type === 'text' ? spec.multiline === true : false,
      ...(spec.type === 'text' && spec.placeholder !== undefined ? { placeholder: spec.placeholder } : {}),
      numeric: spec.type === 'number',
      style: {
        background:  r.bgFocused,
        text:        r.text,
        border:      r.borderFocused,
        borderWidth: r.borderWidth * zoom,
        radius:      r.radius * zoom,
        paddingX:    r.paddingX * zoom,
        paddingY:    r.paddingY * zoom,
        fontSize:    this.#theme.tokens.typography.label.size * zoom,
        fontFamily:  this.#theme.tokens.typography.fontFamily,
        fontWeight:  String(this.#theme.tokens.typography.label.weight),
        placeholder: r.placeholder,
        selection:   r.selection,
      },
      onCommit: (value) => this.setWidgetValue(nodeId, spec.id, value),
    })
  }

  #openWidgetCombo(
    nodeId: NodeId, spec: Extract<WidgetSpec, { type: 'combo' }>,
    rect: { x: number; y: number; width: number; height: number },
  ): void {
    const screen = this.#widgetScreenRect(nodeId, rect)
    const node = this.graph.getNode(nodeId)
    if (!screen || !node) return
    this.#ensureWidgetOverlay().editCombo({
      rect: screen,
      options: comboOptions(spec),
      value: widgetValue(node, spec),
      fontSize: this.#theme.tokens.typography.label.size * this.#viewport.state.zoom,
      onPick: (value) => this.setWidgetValue(nodeId, spec.id, value),
    })
  }

  #openWidgetColor(
    nodeId: NodeId, spec: Extract<WidgetSpec, { type: 'color' }>,
    rect: { x: number; y: number; width: number; height: number },
  ): void {
    const screen = this.#widgetScreenRect(nodeId, rect)
    const node = this.graph.getNode(nodeId)
    if (!screen || !node) return
    this.#ensureWidgetOverlay().editColor({
      rect: screen,
      value: String(widgetValue(node, spec)),
      // Live preview while picking (no command); the final pick commits one undoable step.
      onInput: (hex) => { this.#views.get(nodeId)?.updateWidget?.(spec.id, hex); this.#requestRender() },
      onCommit: (hex) => this.setWidgetValue(nodeId, spec.id, hex),
    })
  }

  /** Forward a drag on a custom widget to its controller's `onPointer` (widget-local coords). Live
   *  preview via `updateWidget`; commit the final value once on pointerup (one undo step). */
  #beginCustomWidgetDrag(
    nodeId: NodeId, view: NodeView, spec: Extract<WidgetSpec, { type: 'custom' }>,
    rect: { x: number; y: number; width: number; height: number },
    ctrl: CanvasWidgetController, e: FederatedPointerEvent,
  ): void {
    const node = this.graph.getNode(nodeId)
    if (!node) return
    const stage = this.#app.stage
    let cur = widgetValue(node, spec)
    const send = (phase: 'down' | 'move' | 'up', gx: number, gy: number): void => {
      const l = view.container.toLocal({ x: gx, y: gy })
      const next = ctrl.onPointer!(phase, l.x - rect.x, l.y - rect.y, { value: cur, node, width: rect.width, height: rect.height, ...this.#widgetThemeColors(spec) })
      if (next !== undefined) { cur = next; view.updateWidget?.(spec.id, cur); this.#requestRender() }
    }
    const onMove = (ev: FederatedPointerEvent): void => send('move', ev.global.x, ev.global.y)
    const onUp = (ev: FederatedPointerEvent): void => {
      stage.off('pointermove', onMove); stage.off('pointerup', onUp); stage.off('pointerupoutside', onUp)
      send('up', ev.global.x, ev.global.y)
      this.setWidgetValue(nodeId, spec.id, cur)
    }
    stage.on('pointermove', onMove); stage.on('pointerup', onUp); stage.on('pointerupoutside', onUp)
    send('down', e.global.x, e.global.y)
  }

  #beginWidgetDrag(
    nodeId: NodeId, view: NodeView, spec: WidgetSpec,
    fullRect: { x: number; y: number; width: number; height: number },
    e: FederatedPointerEvent,
  ): void {
    const rect = fullRect
    if (spec.key === undefined) return
    const stage = this.#app.stage
    const valueAt = (globalX: number): number => {
      const local = view.container.toLocal({ x: globalX, y: 0 })
      if (spec.type === 'slider') {
        const frac = Math.min(1, Math.max(0, (local.x - rect.x) / rect.width))
        return spec.min + frac * (spec.max - spec.min)
      }
      // number: scrub — 1 step per `scrubPx` of horizontal travel from the press point.
      const startNode = this.graph.getNode(nodeId)
      const base = startNode ? Number(widgetValue(startNode, spec)) : 0
      const step = spec.type === 'number' ? (spec.step ?? 1) : 1
      const dx = local.x - startLocalX
      return base + Math.round(dx / 4) * step
    }
    const startLocalX = view.container.toLocal({ x: e.global.x, y: 0 }).x
    const startGlobalX = e.global.x
    let moved = false
    const onMove = (ev: FederatedPointerEvent): void => {
      if (Math.abs(ev.global.x - startGlobalX) > 3) moved = true
      const clamped = clampWidgetValue(spec, valueAt(ev.global.x))
      view.updateWidget?.(spec.id, clamped)
      this.#requestRender()
    }
    const onUp = (ev: FederatedPointerEvent): void => {
      stage.off('pointermove', onMove)
      stage.off('pointerup', onUp)
      stage.off('pointerupoutside', onUp)
      // A number click without dragging opens precise text entry; a slider/number drag commits.
      if (!moved && spec.type === 'number') {
        view.updateWidget?.(spec.id, widgetValue(this.graph.getNode(nodeId)!, spec))
        this.#openWidgetTextEditor(nodeId, spec, fullRect)
        return
      }
      this.setWidgetValue(nodeId, spec.id, valueAt(ev.global.x))
    }
    stage.on('pointermove', onMove)
    stage.on('pointerup', onUp)
    stage.on('pointerupoutside', onUp)
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
    // H6 — bring picked nodes to the front of #nodesLayer. Without this, dragging a node UNDER
    // another (e.g. starting a drag from a node that overlaps a freshly-pasted one) keeps the
    // dragged node visually beneath. Rete `simpleNodesOrder` — small UX polish, big "feels right"
    // win. Excludes expanded macros (their frame manages its own z-order via #macroOverlayLayer).
    for (const id of ids) {
      const v = this.#views.get(id)
      const n = this.graph.getNode(id)
      if (v && n && !(isMacro(n) && n.state['collapsed'] === false)) {
        if (v.container.parent === this.#nodesLayer) this.#nodesLayer.addChild(v.container) // re-add = move to top
      }
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
    this.#drawEdge(ghost, from, to, { sourceType: source.type, noMidpoint: true })

    let validity: 'none' | 'valid' | 'invalid' = 'none'
    if (hoveredTarget) {
      const targetNode = this.graph.getNode(hoveredTarget.nodeId as NodeId)
      const sourcePin = sourceNode.pins.find((p) => String(p.id) === source.pinId)
      const targetPin = targetNode?.pins.find((p) => String(p.id) === hoveredTarget.pinId)
      if (sourcePin && targetPin && targetNode) {
        validity = this.#connectionAllowed(sourceNode, sourcePin, targetNode, targetPin) ? 'valid' : 'invalid'
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
        this.#connectionAllowed(sourceNode, sourcePin, targetNode, targetPin)
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
        // Cancellable hook — a plugin can veto a user-dragged connection by calling cancel().
        // Same gate the public addEdge() runs through; without it, only programmatic edges would
        // be vetoable and the interactive drop would silently sneak past.
        if (firePreventable(this.#events, 'edge:connecting', { edge })) {
          this.#edgeOpts.set(edge.id, opts)
          this.commandBus.apply(new ConnectPins(edge))
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
