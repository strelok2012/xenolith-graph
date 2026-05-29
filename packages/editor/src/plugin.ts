import type { CommandBus, Graph, NodeRegistry, TypeRegistry, NodeId, EdgeId, Pin, FlattenedTemplate } from '@xenolith/core'
import type { Application } from 'pixi.js'
import type { CustomWidgetController, IconRegistry } from '@xenolith/render-pixi'
import type { EditorEvents } from './events.js'
import type { ConnectionRequest, GraphSnapshot } from './index.js'

/** Stable facade over the editor's public extension points, handed to a plugin's `install`. The
 *  editor wires these to its own surface so a plugin never reaches into private state. */
export interface PluginContext {
  /** Node-type schema registry searched by the insert palette. */
  readonly registry: NodeRegistry
  /** Custom pin-type descriptors (colour/shape/compatibility). */
  readonly types: TypeRegistry
  /** Header glyph icons by name — register custom icons, then reference them from a node's glyph. */
  readonly icons: IconRegistry
  /** The PIXI application — for plugins that need the ticker, renderer, or canvas. */
  readonly app: Application
  /** The active (displayed) graph — the root document, or a template definition while dived. */
  readonly graph: Graph
  /** The active (displayed) command bus. */
  readonly commandBus: CommandBus
  registerWidget(name: string, controller: CustomWidgetController): void
  setIsValidConnection(fn: ((c: ConnectionRequest) => boolean) | null): void
  on<E extends keyof EditorEvents>(event: E, handler: (payload: EditorEvents[E]) => void): () => void

  // ---- Simulation/runtime surface (delegates to the editor) ------------------------------------
  /** Per-frame clock for a host evaluator. `cb` gets the frame delta in ms. Returns an unsubscribe. */
  onTick(cb: (dtMs: number) => void): () => void
  /** Begin firing `onTick` every animation frame. */
  startLoop(): void
  /** Stop the per-frame loop (`step` still works). */
  stopLoop(): void
  /** Fire one tick manually with a fixed delta (deterministic stepping). */
  step(dtMs?: number): void
  /** Set a widget value. `{ ephemeral: true }` writes without an undo command — for per-tick writes. */
  setWidgetValue(nodeId: NodeId, widgetId: string, value: unknown, opts?: { ephemeral?: boolean }): void
  /** Replace a node's pins at runtime (variadic-pin primitives). */
  setNodePins(nodeId: NodeId, pins: Pin[]): void
  /** Toggle an edge's animated flow. */
  setEdgeAnimated(edgeId: EdgeId, animated: boolean): void
  /** Read-only flatten of a template instance into its primitive subgraph. */
  expandTemplateInstance(nodeId: NodeId): FlattenedTemplate | null
  /** Plain structural snapshot of the graph (`{ expandMacros: true }` flattens collapsed macros). */
  graphSnapshot(opts?: { expandMacros?: boolean }): GraphSnapshot
}

/** A unit of editor extension. `install` runs immediately on `editor.use(plugin)`; the optional
 *  returned disposer runs on `editor.destroy()`. */
export interface XenolithPlugin {
  name: string
  install(ctx: PluginContext): (() => void) | void
}

const noop = (): void => {}

/** Installs plugins and tears them down. Pure: it owns only the name→disposer map and a context
 *  factory, so it's testable without a live editor. The editor composes one and delegates `use`. */
export class PluginHost {
  readonly #disposers = new Map<string, () => void>()
  readonly #makeContext: () => PluginContext

  constructor(makeContext: () => PluginContext) {
    this.#makeContext = makeContext
  }

  use(plugin: XenolithPlugin): void {
    if (this.#disposers.has(plugin.name)) {
      throw new Error(`PluginHost: plugin "${plugin.name}" is already installed`)
    }
    const disposer = plugin.install(this.#makeContext())
    this.#disposers.set(plugin.name, typeof disposer === 'function' ? disposer : noop)
  }

  has(name: string): boolean { return this.#disposers.has(name) }

  dispose(): void {
    for (const d of this.#disposers.values()) d()
    this.#disposers.clear()
  }
}
