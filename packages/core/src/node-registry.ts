import { fuzzyMatch } from './fuzzy.js'
import { createNodeId, createPinId } from './ids.js'
import type { Node, NodeGlyph, Pin, PinDirection, PinKind, Vec2 } from './graph.js'
import { defaultWidgetValue, type WidgetSpec } from './widget.js'

/** Declarative pin template — instantiated into a concrete {@link Pin} (fresh id) per node. */
export interface PinSchema {
  kind: PinKind
  direction: PinDirection
  type: string
  label?: string
  multiple?: boolean
  default?: unknown
}

/** Declarative description of a node *type*. Hosts register these; the insert palette searches
 *  them and {@link NodeRegistry.instantiate} turns one into a concrete {@link Node}. */
export interface NodeSchema {
  type: string
  title: string
  category?: string
  /** One-line summary shown under the title in the insert palette. */
  description?: string
  /** Extra search terms beyond the title (synonyms, abbreviations). */
  keywords?: string[]
  pins: PinSchema[]
  /** In-node UI controls copied onto each instantiated node; defaults seed `node.state`. */
  widgets?: WidgetSpec[]
  /** Blueprint "pure" node (no exec flow). Copied onto each instance. */
  pure?: boolean
  /** Arbitrary host/plugin metadata, copied onto each instance and passed through serialization. */
  meta?: Record<string, unknown>
  /** Header glyph icon copied onto each instantiated node (auto-drawn in the header). */
  glyph?: NodeGlyph
}

export interface NodeSearchResult {
  schema: NodeSchema
  score: number
  /** Matched character indices into `schema.title` for highlighting (empty if the match came
   *  from a keyword or category rather than the title). */
  indices: number[]
}

export class NodeRegistry {
  readonly #schemas = new Map<string, NodeSchema>()

  get size(): number { return this.#schemas.size }

  register(schema: NodeSchema): void { this.#schemas.set(schema.type, schema) }
  unregister(type: string): boolean  { return this.#schemas.delete(type) }
  clear(): void                      { this.#schemas.clear() }
  has(type: string): boolean         { return this.#schemas.has(type) }
  get(type: string): NodeSchema | undefined { return this.#schemas.get(type) }
  all(): NodeSchema[] { return [...this.#schemas.values()] }

  /** Turn a registered schema into a concrete Node with freshly minted node/pin ids. Throws if
   *  the type isn't registered. */
  instantiate(type: string, position: Vec2): Node {
    const schema = this.#schemas.get(type)
    if (!schema) throw new Error(`NodeRegistry.instantiate: unknown node type "${type}"`)
    const pins: Pin[] = schema.pins.map((p) => {
      const pin: Pin = {
        id: createPinId(),
        kind: p.kind,
        direction: p.direction,
        type: p.type,
        multiple: p.multiple ?? false,
      }
      if (p.label !== undefined) pin.label = p.label
      if (p.default !== undefined) pin.default = p.default
      return pin
    })
    const node: Node = { id: createNodeId(), type: schema.type, position: { ...position }, state: {}, pins }
    if (schema.pure !== undefined) node.pure = schema.pure
    if (schema.meta !== undefined) node.meta = { ...schema.meta }
    if (schema.glyph !== undefined) node.glyph = { ...schema.glyph }
    if (schema.widgets && schema.widgets.length > 0) {
      node.widgets = schema.widgets.map((w) => ({ ...w }) as WidgetSpec)
      for (const w of node.widgets) {
        if (w.key !== undefined) node.state[w.key] = defaultWidgetValue(w)
      }
    }
    return node
  }

  /** Fuzzy search across title, keywords and category. Returns results sorted by descending
   *  score (ties broken by title). An empty query returns every schema in title order. */
  search(query: string): NodeSearchResult[] {
    if (query.trim() === '') {
      return this.all()
        .sort((a, b) => a.title.localeCompare(b.title))
        .map((schema) => ({ schema, score: 0, indices: [] }))
    }
    const results: NodeSearchResult[] = []
    for (const schema of this.#schemas.values()) {
      const titleMatch = fuzzyMatch(query, schema.title)
      let best = titleMatch.matched ? titleMatch.score : -1
      let indices = titleMatch.matched ? titleMatch.indices : []
      for (const kw of schema.keywords ?? []) {
        const m = fuzzyMatch(query, kw)
        if (m.matched && m.score > best) { best = m.score; indices = [] }
      }
      if (schema.category) {
        const m = fuzzyMatch(query, schema.category)
        if (m.matched && m.score > best) { best = m.score; indices = [] }
      }
      if (best >= 0) results.push({ schema, score: best, indices })
    }
    return results.sort((a, b) =>
      b.score - a.score || a.schema.title.localeCompare(b.schema.title),
    )
  }
}
