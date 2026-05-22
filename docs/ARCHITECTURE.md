# XenolithGraph — Architecture

This document describes the locked-in architecture for v0.x. Individual decisions are recorded as ADRs under `docs/adr/`. Anything not in this document or an ADR is **not yet decided** — open a discussion before assuming.

## 1. Principles

1. **Headless first.** The core graph model, types, and command bus run with zero dependencies and no awareness of DOM, Canvas, or PIXI. This makes the library testable without a browser and lets the rendering backend be replaced in v2.x without rewriting logic.
2. **WebGL by default.** PIXI v8 is the default renderer because the perf gap over Canvas2D on 500+ node graphs is the entire reason this library exists. (See ADR-0001.)
3. **TypeScript-first, ESM-only.** No CommonJS build output. Targets ES2022. No legacy.
4. **Framework-agnostic core + thin adapters.** React, Vue, Svelte get tiny wrappers around the same engine. No framework is privileged.
5. **Blueprint semantics are first-class.** Typed pins, `exec` vs `data` kind, type-color system, K2-style search palette — these live in the core model, not in a theme.
6. **No new dependencies in `@xenolith/core`. Ever.** Render and adapter layers may add deps but each addition requires PR justification.
7. **Perf budgets enforced in CI.** Without them, this library decays into "the next slow node editor."

## 2. Layered model

```
┌──────────────────────────────────────────────────────────────┐
│ Framework adapters (React / Vue / Svelte / vanilla)          │
│   Translate framework reactivity ⇄ core event bus.           │
├──────────────────────────────────────────────────────────────┤
│ Editor                                                       │
│   Composes Renderer + Interaction + Commands + Plugins.      │
│   Owns the lifecycle.                                        │
├─────────────────────┬─────────────────────┬──────────────────┤
│ Renderer            │ Interaction         │ Plugin host      │
│  PIXI v8 scene      │ pointer / keyboard  │ registry &       │
│  pin · edge · node  │ marquee · drag      │ lifecycle        │
│  drawing · theme    │ pan · zoom · snap   │                  │
├─────────────────────┴─────────────────────┴──────────────────┤
│ Core (headless)                                              │
│  Graph model · Type system · Command bus · Validation        │
│  Event emitter · Selection · Viewport state · Schemas        │
│  Zero runtime dependencies.                                  │
└──────────────────────────────────────────────────────────────┘
```

**Strict rule:** an upper layer may import from any layer below it. A lower layer may **never** import from a layer above it. CI enforces this with import-boundary rules.

## 3. Package map

| Package | Status | Role |
|---|---|---|
| `@xenolith/core` | v0.1 | Headless graph model, type system, command bus, events. Zero deps. |
| `@xenolith/render-pixi` | v0.1 | PIXI v8 renderer. PIXI is a **peer** dependency, not bundled. |
| `@xenolith/editor` | v0.1 | Wires core + renderer + interaction + plugins into a usable editor. |
| `@xenolith/theme-ue5` | v0.2 | Default theme. Tokens generated from the Figma design system. |
| `@xenolith/plugin-search` | v0.2 | K2-style Tab palette with fuzzy search and contextual filtering. |
| `@xenolith/plugin-undo` | v0.2 | Undo/redo over the command bus. |
| `@xenolith/plugin-serialize` | v0.2 | JSON v1 file format with migrations. |
| `@xenolith/plugin-minimap` | v0.3 | Minimap. |
| `@xenolith/plugin-clipboard` | v0.3 | Copy/paste across tabs and instances. |
| `@xenolith/plugin-alignment` | v0.3 | Auto-arrange, alignment guides. |
| `@xenolith/react` | v0.4 | React adapter. |
| `@xenolith/svelte` | v0.4 | Svelte adapter. |
| `@xenolith/vue` | v0.4 | Vue adapter. |
| `@xenolith/theme-ue4` | post-1.0 | Alternative theme. |

Apps under `apps/`:

| App | Purpose |
|---|---|
| `playground` | Vite-based dev sandbox. Used during library development. |
| `docs` | Documentation site (Astro or Docusaurus, decided in v0.4). |
| `examples/llm-workflow` | Showcase clone of a LangFlow-style tool built on XenolithGraph. The launch artifact for v0.5. |

## 4. Core data model (sketch)

```ts
type NodeId    = string & { readonly _: 'NodeId' }
type PinId     = string & { readonly _: 'PinId' }
type EdgeId    = string & { readonly _: 'EdgeId' }
type CommentId = string & { readonly _: 'CommentId' }
type TypeId    = string & { readonly _: 'TypeId' }

interface Graph {
  nodes:    Map<NodeId, Node>
  edges:    Map<EdgeId, Edge>
  comments: Map<CommentId, Comment>
}

interface Node {
  id: NodeId
  type: string                  // references a NodeSchema
  position: Vec2
  size?: Vec2                   // some nodes are resizable
  state: Record<string, unknown>
  pins: Pin[]                   // resolved from schema + state
}

interface Pin {
  id: PinId
  kind: 'exec' | 'data'         // first-class Blueprint distinction
  direction: 'in' | 'out'
  type: TypeId
  multiple: boolean             // exec-out: single; data-in: single; exec-in / data-out: multi
  label?: string
  default?: unknown
}

interface Edge {
  id: EdgeId
  from: { node: NodeId; pin: PinId }
  to:   { node: NodeId; pin: PinId }
}

interface TypeDescriptor {
  id: TypeId
  color: string                 // UE5 type-color palette
  shape: 'circle' | 'diamond' | 'arrow'
  cast?: (v: unknown) => unknown
  compatibleWith?: TypeId[]
  serializer?: { to(v: unknown): JsonValue; from(j: JsonValue): unknown }
}

interface NodeSchema {
  type: string
  category: string              // for the K2 palette ("Math > Float")
  title: string | ((node: Node) => string)
  color?: string                // header color
  pins: PinSchema[] | ((node: Node) => PinSchema[])
  ports?: { allowAddIn?: boolean; allowAddOut?: boolean }
  widgets?: WidgetSchema[]      // inline inputs (slider, dropdown, text)
}
```

## 5. Command bus

All graph mutations go through a typed `CommandBus`. Every command is an `apply` / `undo` pair.

```ts
interface Command<T = unknown> {
  type: string
  apply(graph: Graph): T
  undo(graph: Graph, applied: T): void
}
```

Initial command set: `AddNode`, `RemoveNode`, `MoveNodes`, `ResizeNode`, `ConnectPins`, `DisconnectEdge`, `AddComment`, `RemoveComment`, `SetNodeState`.

Why this matters even at v0.1: undo/redo, replay-based debugging, deterministic Vitest fixtures, and a path to CRDT-based collaborative editing in v2.x — all from the same primitive.

## 6. Renderer (`@xenolith/render-pixi`)

PIXI v8 scene structured as explicit layers:

```
Stage
├── BackgroundLayer    — grid / dots, viewport-aware tiling
├── CommentsLayer      — comment blocks (below nodes)
├── EdgesLayer         — bezier curves; Mesh + custom shader for exec pulse
├── EdgePreviewLayer   — the edge being dragged
├── NodesLayer         — one Container per node
│   └── Node
│       ├── ShadowSprite
│       ├── BodyGraphics
│       ├── HeaderText (BitmapText for perf)
│       ├── PinsContainer (Pin = Graphics + HitArea)
│       └── WidgetsContainer (anchors HTML overlays)
└── OverlayLayer       — marquee, tooltips, snap guides
```

Key implementation notes:

- **Text:** `BitmapText` for labels; HTML overlay for editable inputs. The renderer leaves a "hole" in PIXI space and a DOM input sits on top, position-synced. This is the standard pattern (Excalidraw, Figma).
- **Edges:** bezier with UE-tuned curvature. Exec-edge pulse uses a custom shader with a time uniform on a `Mesh`, not per-frame `Graphics` redraws.
- **Hit-test:** PIXI's built-in for nodes; a separate **quadtree** in core for pins and edges on graphs with 1000+ entities.
- **Culling:** viewport culling is explicit. PIXI v8 helps but does not cull arbitrarily; we add a coarse pass per layer.
- **Inline widgets:** **HTML overlay** synced to PIXI coordinates. Editable text, sliders, dropdowns are real DOM. Non-editable visuals are PIXI.

## 7. Interaction layer

A standalone `InteractionManager` listens to canvas pointer/keyboard events and emits **intents**, not mutations:

```ts
// Intent — recognised gesture, not yet a command
type Intent =
  | { kind: 'pan'; delta: Vec2 }
  | { kind: 'zoom'; factor: number; focal: Vec2 }
  | { kind: 'selectMarquee'; rect: Rect }
  | { kind: 'dragNodes'; ids: NodeId[]; delta: Vec2 }
  | { kind: 'connectPins'; from: PinRef; to: PinRef }
  | { kind: 'insertReroute'; edge: EdgeId; at: Vec2 }
  | ...
```

The Editor turns intents into commands via the bus. This separation makes interactions independently testable and keeps mutation paths uniform.

Gestures shipped in v0.1:

- pan / zoom with UE-style focal zoom
- marquee selection
- node drag with snap-to-grid and alignment guides
- pin drag → preview edge → validate-on-drop
- edge double-click → insert reroute node
- keyboard: Del, Ctrl+Z, Ctrl+D (duplicate), Tab (palette)

## 8. Plugin system

```ts
interface Plugin {
  name: string
  install(ctx: EditorContext): void
  uninstall?(ctx: EditorContext): void
}
```

`EditorContext` exposes the graph, command bus, event bus, viewport, and renderer hooks. Plugins do not have private access to internals — they use the same public surface as user code.

Plugins shipped in v0.2:

- `plugin-search` — Tab palette, fuzzy + categorical + context-aware filtering by source pin type.
- `plugin-undo` — multi-step history over the command bus.
- `plugin-serialize` — JSON v1 file format with `schemaVersion` and migration registry.

## 9. Theming

A theme is a flat token bundle:

```ts
interface Theme {
  background: { color: string; grid: GridStyle }
  node:    { body, header, shadow, selection, hover, ... }
  pin:     { sizes, shapes, hoverHalo }
  edge:    { width, bezierTension, pulse: ShaderConfig }
  comment: { defaults }
  typeColors: Record<TypeId, string>
}
```

`@xenolith/theme-ue5` is the default. Tokens are generated from the Figma design system (Tokens Studio export → `theme-ue5/src/tokens.json`). Themes are stylistic only — they do not change behaviour.

## 10. File format & serialization

JSON `xenolith.v1.json` with strict schema:

- `schemaVersion: 1`
- stable IDs (UUID v7 — time-sortable, useful for collab later)
- migrations are functions registered on the deserializer
- optional content hash

The format is treated as **load-bearing infrastructure**. Breaking changes between major versions require a migration; minor versions never break.

## 11. Performance budgets (CI-enforced)

These are not advisory:

| Metric | Budget |
|---|---|
| Frame time, 500 nodes / 1000 edges | 16.6 ms (60 fps) on M1 / Ryzen 5 |
| Drag of 50 selected nodes | 0 GC pauses over 5 s |
| Cold-start with 100 nodes | < 100 ms |
| `@xenolith/core` bundle | < 30 kB gzip |
| `@xenolith/render-pixi` bundle | < 80 kB gzip (PIXI excluded as peer) |
| `@xenolith/editor` bundle | < 50 kB gzip |

Bench harness runs in CI on a fixed runner. A PR that regresses any budget either fixes it or is reverted.

## 12. Roadmap

| Milestone | Scope |
|---|---|
| **v0.1** | Core + render-pixi + editor MVP. Nodes, pins, edges, pan/zoom, selection, drag. No undo, no palette. Playground demo. |
| **v0.2** | Typed pins, connection validation, UE5 theme, Tab palette, undo, JSON serialize. |
| **v0.3** | Comments, reroute, copy/paste, minimap, alignment plugin. |
| **v0.4** | React/Vue/Svelte adapters, docs site, landing page. |
| **v0.5** | LLM-workflow showcase example. Launch artifact for Twitter/HN. |
| **v1.0** | API freeze, file format freeze, all perf budgets green in CI. |

## 13. Conventions

- No comments unless the *why* is non-obvious. Identifiers carry the *what*.
- No backwards-compat shims before v1.0. Breaking changes ship via changesets.
- No new dependencies in `@xenolith/core`. Render and adapter layers add deps only with PR justification.
- Every public API change ships with a Vitest test.
- Every interaction change ships with a Playwright test.
- Visual changes ship with a renderer snapshot test.
- When in doubt how something should feel, open UE5 and copy it. Recognizability is the product.

## 14. Open questions

Tracked here until resolved into ADRs:

- Final library name (Xenolith is working title).
- Collaboration backend: Yjs vs Loro vs custom CRDT. Decided in v2.x; current command-bus design keeps both viable.
- Whether to ship a default runtime executor (`plugin-execute`) or leave execution entirely to hosts. Leaning: leave to hosts.
- Whether docs site is Astro Starlight or Docusaurus. Decided in v0.4.
