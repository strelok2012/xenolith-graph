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
| `@xenolith/core` | shipped | Headless graph model, types, command bus, events, plan-* helpers for macros/templates/reroutes. Zero deps. |
| `@xenolith/render-pixi` | shipped | PIXI v8 renderer (nodes, edges, comments, macros, widgets, glyphs, LOD sprite/flat). PIXI is a **peer** dependency. |
| `@xenolith/editor` | shipped | Composes renderer + interaction + commands + **plugin host**. Owns lifecycle, palette, minimap, overlays, dive-stack. Bundles undo, serialize, clipboard, palette, alignment guides — not separate plugins. |
| `@xenolith/theme-xen` | shipped | Default theme (Xen — original dark/gold design system). Tokens originate from Figma. |
| `@xenolith/theme-liquid-glass` | shipped | Optional shader-based theme: refraction + rim lighting via PIXI `Mesh`+`Shader` and a backdrop `RenderTexture`. |
| `@xenolith/demo` | shipped | One `xenolith.v1` data graph + ComfyUI importer + topology-reactive runners. Consumed by every demo host. |
| `@xenolith/adapter-core` | shipped | Framework-agnostic editor wrapper used by the WC + framework adapters. |
| `@xenolith/wc` | shipped | Web-component adapter (universal). |
| `@xenolith/react` | shipped | React adapter: `<XenolithPanel>`, `<XenolithControls>`, `<XenolithMiniMap>`, `<XenolithButton>`, reactive selector hooks, editor context. |
| `@xenolith/vue` / `@xenolith/svelte` / `@xenolith/solid` | planned | Thin adapters over `adapter-core` + `wc`. React parity is the contract. |
| `@xenolith/plugin-runtime` | in progress | Blueprint VM (exec-push + pure-pull, `Allocate` verb). Installs into the editor through the plugin host using `setNodePins`, `setWidgetValue({ephemeral})`, `expandTemplateInstance`, `onTick`, `setEdgeAnimated`, `graphSnapshot`. Execution is **not** in the editor itself. |

The earlier separate `plugin-search` / `plugin-undo` / `plugin-serialize` / `plugin-minimap` / `plugin-clipboard` / `plugin-alignment` packages were folded into `@xenolith/editor` once it became clear they have no reuse outside it. The published plugin surface is now `editor.use(plugin)` for third-party extensions (see §8).

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
  color: string                 // Xen type-color palette
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
├── BackgroundLayer    — grid / dots, viewport-aware tiling (TilingSprite)
├── BackdropRT         — per-frame RenderTexture for shader themes (Liquid Glass)
├── CommentsLayer      — comment blocks behind nodes; header + body Graphics
├── MacroFrameLayer    — outlines + headers of expanded macros (between comments and nodes)
├── EdgesLayer         — bezier wires; animated/exec pulse drawn per-frame only when active
├── EdgePreviewLayer   — the edge being dragged
├── NodesLayer         — full-fidelity nodes near the viewport
│   └── Node
│       ├── ShadowSprite
│       ├── BodyGraphics (header gradient + body fill + rim)
│       ├── GlyphSprite  (Feather/custom SVG icon on the header, left or right)
│       ├── HeaderText   (BitmapText shared glyph atlas)
│       ├── PinsContainer (Pin = Graphics; exec → arrow, struct → diamond, data → circle)
│       └── WidgetsContainer (canvas-draw widgets in PIXI; DOM widgets anchored via overlayRoot)
├── LodSpriteLayer     — distant nodes baked to a single Sprite (still recognisable)
├── LodFlatLayer       — far-distant nodes as a batched solid-rect pass
├── OverlayLayer       — marquee, snap guides, pin hover halo
└── overlayRoot (DOM)  — palette, edge menu, widget popovers, breadcrumb, busy spinner
```

Key implementation notes:

- **Text:** `BitmapText` (shared glyph atlas) for every node title, pin label, widget label. Editable text uses a DOM overlay positioned over the WebGL "hole" — same pattern as Excalidraw/Figma. Used for: inline node rename, comment title, template-boundary rename, text-widget input, combo dropdown, palette.
- **Edges:** cubic Bezier with UE-tuned curvature. Per-edge `animated` flag (round-tripped through the file format) toggles a marching-pulse render — animated edges break render-on-demand for the frames they're visible and should be used sparingly.
- **Glyphs:** small SVG icons rendered into a cached `Sprite`. Built-in Feather set + custom register via `editor.icons.register(name, svgString)`. Schema may declare `glyph: { icon, side }`; per-node override stored under `RenderNodeOptions.glyph` survives serialization.
- **Header layout (UE-Blueprint):** when a node has exactly one exec-in *or* one unlabelled exec-out, the renderer hoists it onto the header line (left of title for in, right for out — pin shape replaces the usual padding). Data pins stay below. Aligns with Unreal Blueprint visual grammar.
- **Hit-test:** PIXI's built-in (federated events + `eventMode='static'`) for nodes/pins/comments/macros. A spatial-grid culling index in the editor is read by virtualization (§11) and is **not** the hit-test path.
- **Render-on-demand:** the editor calls `renderer.render()` only when the scene actually changes (drag, drop, viewport change, animated edge tick). Static graphs idle at 0 fps cost. This is a **load-bearing perf invariant** — see §11.
- **Inline widgets:** two controller kinds, both registered via `editor.registerWidget(name, controller)`:
  - **canvas-draw** — `draw(ctx, ctx2)` paints to a 2D-canvas, baked to a WebGL texture. No DOM. Hot path.
  - **DOM-mount** — `mount(el, {value, setValue})` renders arbitrary HTML, glued to the node's on-screen rect through pan/zoom/drag via overlayRoot. The contract React/Vue/Svelte adapters wrap.

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

Gestures shipped:

- pan / zoom with UE-style focal zoom (`InteractionManager` on Pointer Events + `setPointerCapture`)
- marquee selection (excludes hidden macro members)
- node drag (8 px snap, `Alt` to disable; per-node rounding fixed)
- pin drag → live ghost edge → type-compat validation → connect or refuse
- `Alt`+drag a connected pin → tear the wire off and re-wire
- edge mid-point context menu: **Add Node** (filtered by compatible types) · **Add Reroute** · **Delete**
- comment: drag header to move, drag corner to resize, double-click header to rename (DOM overlay), `Tab` → "Comment" to spawn
- macro: `Cmd+G` group selection; double-click expanded macro header to rename
- live-template: `Cmd+Shift+G` templatize; double-click an instance to dive in; breadcrumb in `overlayRoot` to dive out
- keyboard: `Delete` · `⌘Z` / `⌘⇧Z` · `⌘C` / `⌘V` · `⌘D` (duplicate) · `⌘A` (select-all top-level) · `Tab` (palette)
- right-click a node or edge → context menu (Rename, Convert to Group / Template, Unpack, Ungroup, etc., context-sensitive)

Touch / mobile is a tracked v1.0 gap. The Pointer-Events infrastructure is in place; pinch-zoom + two-finger pan + long-press menu are the planned additions.

## 8. Plugin host

The editor is a plugin host. Anything *non-rendering* and *not in the editor itself* — custom node packs, custom types, custom widgets, runtimes, connection rules, collab adapters — installs through one API.

```ts
interface Plugin {
  name: string
  install(ctx: PluginContext): void | (() => void)   // returned function is the disposer
}

editor.use(plugin)            // mounts the plugin; disposer is called on editor.destroy()
```

`PluginContext` is the public surface — plugins do not have private access. It exposes:

| Surface | Use |
|---|---|
| `registry` | Register `NodeSchema`s; they appear in the palette and can be inserted by `editor.insertNode(type, pos)`. |
| `types` | `TypeRegistry` — register pin types with `{ id, color, shape, compatibleWith? }`. Pin shape ∈ `circle` (data) · `arrow` (exec) · `diamond` (struct). |
| `icons` | Glyph registry (Feather built-in + custom SVG). Drives `NodeSchema.glyph` / `setNodeGlyph`. |
| `graph` | Read-only view of the active graph (respects dive-in). |
| `commandBus` | Group mutations into one undoable transaction. Use sparingly. |
| `app` | The PIXI `Application` — escape hatch for custom rendering plugins. Avoid unless rendering. |
| `on(event, handler)` | Full event bus (`node:added`, `edge:added`, `node:moved`, `widget:changed`, `selection:changed`, `viewport:changed`, `dive:changed`, …). Bridged off the command bus so it fires on undo/redo too. |
| `registerWidget(name, ctrl)` | Canvas-draw or DOM-mount custom widgets. |
| `setIsValidConnection(pred)` | Global connection validator run after built-in type-compat. |

**Runtime delegation surface** (for execution plugins — `@xenolith/plugin-runtime` is the in-progress consumer):

| Surface | Use |
|---|---|
| `onTick(cb)` · `startLoop()` · `stopLoop()` · `step()` | Frame ticker the editor owns. The runtime decides what runs each tick. |
| `setWidgetValue(nodeId, key, value, { ephemeral })` | `ephemeral: true` writes the value without going through the command bus (no undo entry, no `widget:changed` storm). For sims/audio/LLM streaming. |
| `setNodePins(nodeId, pins)` | Variadic pins (Sequence, MakeArray) — replace the pin list; dangling edges pruned. |
| `expandTemplateInstance(nodeId)` | Read-only, recursive flatten of a template instance into primitives (in-memory; the editor is not mutated). |
| `graphSnapshot({ expandMacros, flattenReroutes })` | Whole-graph view for execution planning. Uses `flattenMacroProxies` and `flattenReroutes` in core. |
| `setEdgeAnimated(edgeId, on)` | Toggle the marching-pulse render on a wire (for "this edge is firing now"). |

### Built-in plugins (folded into the editor)

Undo/redo, JSON `xenolith.v1` serialize, copy/paste, K2-style Tab palette with fuzzy search, minimap, alignment guides, keyboard shortcuts, comment/macro/template authoring — all live in `@xenolith/editor` because none of them have any meaning outside it. `editor.use()` exists for *new* surfaces the editor cannot anticipate.

### Planned third-party consumers

- `@xenolith/plugin-runtime` — Blueprint VM (exec-push + pure-pull, `Allocate` verb). Installs via `editor.use(runtime({...}))` and uses the runtime-delegation surface above.
- `@xenolith/layout-elk` — auto-layout (ELK/Dagre) plugin reading `graphSnapshot` and emitting batched move commands.
- Collaboration: a `yjsAdapter(editor, ydoc)` plugin mapping commands ⇄ Y-ops with `Y.Text` for comment / textfield bodies and LWW for positions. Deferred (see §14).

## 8.5. Subgraph patterns

Three orthogonal ways to organise nodes — they coexist in the same document.

### Comments
A labelled rectangle behind nodes. **Spatial group, not data containment** — nothing is "inside" a comment, it's purely visual. Move the comment → nodes spatially inside it move with it (group-drag). Authoring: drag a rectangle / `Tab → Comment` / colour-picker via the header context menu. Serialised in `xenolith.v1` under `comments[]`.

### Macros (collapsed groups)
Pack N selected nodes into one wrapper with proxy pins on its border. The wrapper carries `state.members` + `state.proxyMap` (`MacroProxyRecord[]`). Collapsing re-points boundary edges from member pins to proxy pins inside one command-bus transaction; expanding inverts. **Inline — no shared definition.** Use for one-off grouping. API: `createMacroFromSelection`, `collapseMacro`, `expandMacro`, `ungroupMacro`. Shortcut: `Cmd+G`.

### Live templates (reusable sub-graphs)
One stored **definition** + many **instances**. Editing the definition (via dive-in) propagates to every instance. Implemented in `packages/core/src/template-def.ts` (pure functions; reuses `boundaryEdges`/`macroProxyPins` from `macro.ts`):

- Types: `$templateInput` / `$templateOutput` (boundary nodes; 1 pin each, label = node title) and `$templateInstance` (the spawned node referring to `state.definitionId`).
- `planTemplateExtraction` derives the interface **from member pins**: a pin is promoted to the interface iff it is *not* connected to another member (free OR connected externally → promote; member↔member → internal). External edges are rerouted to the new instance; free pins simply get a boundary node + pin without rewiring.
- Dive-in: `editor.diveInto(instanceId)` swaps `#displayGraph`/`#displayBus` to the definition; `#diveStack` holds per-level graph+bus+selection+viewport; breadcrumb in `overlayRoot`. `diveOut` flushes edits back to the definition.
- Type inference on boundary pins: a fresh `$templateInput`/`$templateOutput` starts `any` and inherits the type from the member pin it connects to (boundary acts as a wildcard relay, like a reroute). Type belongs to the **definition** (inner-driven); per-instance type binding is parked under "generic templates."
- Recursion guard: a definition cannot insert itself or any ancestor on the dive stack (palette filters them out; insert refuses).

API: `createTemplateFromSelection`, `diveInto` / `diveOut`, `renameTemplate`, `unpackTemplateInstance` (inline a copy with fresh ids, drop the shared link), `convertTemplateInstanceToMacro` (template → group), `convertMacroToTemplate` (group → template; carries nested macros into the definition). Shortcut: `Cmd+Shift+G`.

### Reroutes
Two kinds, both first-class:
- **Inline knot** (`$reroute`): non-pullable dot, edge-split semantics, takes the wire's type colour, vanishes if its last connection is removed.
- **Reroute node** (`Reroute`): a movable rectangular relay you *can* pull fresh wires from; lives in the palette.

## 8.6. Widgets

In-node controls. Declarative data on the node (or the schema). Value lives in `node.state[key]` so it serialises with the graph and every change is undoable (or `ephemeral: true` to skip undo, for sims).

Built-in types: `number` (drag-scrub + click-to-type) · `slider` · `combo` · `text` (with `multiline`) · `toggle` · `color` · `button` (fires an action). Custom types via `editor.registerWidget(name, controller)`:

- **canvas-draw** controller — `draw(ctx, {value, width, height})` + `onPointer(phase, x, y, ctx) → newValue`. Painted to a WebGL texture. Hot path for sliders/curves.
- **DOM-mount** controller — `mount(el, {value, setValue}) → cleanup` + `update({value})`. Arbitrary HTML; the editor keeps the element glued to the node's on-screen rect through pan/zoom/drag via `overlayRoot`. The contract React/Vue/Svelte adapters wrap (e.g. `<XenolithReactWidget>`).

ComfyUI import maps `widgets_values` positionally to typed widgets (number→number, boolean→toggle, string→text). Combos and ranges require the server's `object_info` and are a planned upgrade.

DOM widget occlusion (when a DOM widget would visibly overlap WebGL content) is currently solved by rect-difference clipping + per-pin boxes + collapsedRect. Stopgap; the proper fix is bake-to-image during pan/zoom.

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

`@xenolith/theme-xen` is the default. Tokens originate in the Figma source (Xen design system) and live in `theme-xen/src/tokens.json`. Themes are stylistic only — they do not change behaviour. The Xen theme defines four category accents (logic green, data blue, macro purple, utility white), six pin types with shape mapping (circle / empty-circle / chevron), two state styles (hover yellow, selected white), and a glassmorphic header treatment.

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
| Frame time, 40k+ nodes (virtualized) | ~4–7 ms |
| Drag of 50 selected nodes | 0 GC pauses over 5 s |
| Cold-start with 100 nodes | < 100 ms |
| `@xenolith/core` bundle | < 30 kB gzip |
| `@xenolith/render-pixi` bundle | < 80 kB gzip (PIXI excluded as peer) |
| `@xenolith/editor` bundle | < 50 kB gzip |

Bench harness runs in CI on a fixed runner. A PR that regresses any budget either fixes it or is reverted.

### Load-bearing perf mechanisms

These are the *how* behind the budgets — touching any of them requires a before/after measurement on a large graph (the harness exposes one via `window.__xenoEditor` in playground builds).

- **Render-on-demand.** `renderer.render()` runs only when the scene actually changes. Static graphs idle at 0 fps cost. Animated edges, drags, viewport changes invalidate.
- **Viewport virtualization + 3-tier LOD.** Nodes outside an overscanned viewport are not in the scene at all. Nodes inside the overscan but far from focus are baked to a single `Sprite` (sprite tier); even farther, drawn as a batched solid rect (flat tier). Hysteresis prevents churn at the threshold. Tested at 58k nodes; defaults tuned for ≥300 nodes. Configurable per theme (Liquid Glass tier sooner).
- **Shared GPU textures.** Gradient cache (one texture per gradient config across all nodes), glow cache (BlurFilter is the bottleneck — cache the result), bitmap-font glyph atlas (one texture for all node/widget text).
- **Per-node freeze on motion.** Each node bakes to a sprite during drag / viewport motion (not the whole scene, not the backdrop) — kills shader-theme slide and is the basis for LOD.
- **Edges skip redraw when endpoints unchanged.** The per-frame ticker compares position hashes; unchanged wires aren't re-drawn.
- **Defer sync to microtask** on mutation batches; skip JSON in `duplicate` (in-memory clone); paste-at-cursor (no fitView reflow).
- **Spatial-grid culling** index in the editor, refreshed on `node:moved`/`node:added`/`node:removed`. Read by virtualization and by edge-LOD; not the hit-test path.

Rule: O(visible), not O(N).

## 12. Roadmap

| Milestone | Scope | Status |
|---|---|---|
| **v0.1** | Core + render-pixi + editor MVP. Pan/zoom, selection, drag. | shipped |
| **v0.2** | Typed pins, Xen theme, Tab palette, undo, JSON serialize. | shipped |
| **v0.3** | Comments, two reroute kinds + edge-midpoint menu, copy/paste, minimap, alignment guides. | shipped |
| **v0.4** | React adapter (XenolithPanel/Controls/MiniMap/Button + hooks), Liquid Glass theme, docs site, landing page. | shipped |
| **v0.5** | Widgets (number/slider/combo/text/toggle/color/button + canvas-draw + DOM-mount), Macros (collapse-groups), Live templates (definition + dive-in + convert), Plugin host (`editor.use` + `PluginContext`), glyphs, UE-Blueprint header layout, virtualization + LOD (58k tested). | shipped |
| **v0.6** | `@xenolith/plugin-runtime` (Blueprint VM); Vue/Svelte/Solid adapters; touch/mobile (pinch-zoom + long-press); accessibility (ARIA + keyboard nav); auto-layout plugin (ELK/Dagre). | in progress / planned |
| **v1.0** | Public API freeze, `xenolith.v1` format freeze, all perf budgets green in CI, docs site complete. | planned |

Optional / on-demand (not on the critical path): Yjs collab adapter (see [project_xeno_collab_plan](../memory/) — deferred), orthogonal edge routing, LLM-workflow showcase example.

## 13. Conventions

- No comments unless the *why* is non-obvious. Identifiers carry the *what*.
- No backwards-compat shims before v1.0. Breaking changes ship via changesets.
- No new dependencies in `@xenolith/core`. Render and adapter layers add deps only with PR justification.
- Every public API change ships with a Vitest test.
- Every interaction change ships with a Playwright test.
- Visual changes ship with a renderer snapshot test.
- When in doubt how something should feel, refer to the Xen design system in Figma (the canonical source for all visuals). For interaction patterns where Figma is silent (palette behaviour, drag-from-pin to empty space, pin hover halo), reference established blueprint-style editors as inspiration — but the visual outcome must match Xen, not them.

## 14. Open questions

Tracked here until resolved into ADRs:

- Final library name (XenolithGraph is the working title).
- **Runtime executor — RESOLVED:** the editor itself ships no execution. `@xenolith/plugin-runtime` is the in-progress Blueprint VM, installed via `editor.use()` over the runtime-delegation surface (§8). Hosts can swap it.
- **Docs site — RESOLVED:** Astro Starlight.
- **Collaboration — DEFERRED:** Yjs is the chosen backend when the time comes; plan is captured in memory `project_xeno_collab_plan`. Not a v1.0 blocker.
- **Custom renderer — PARKED:** PIXI v8 is fine for now; the scout (May 29) found ~95% of features are mechanical to port (Container/Graphics/Sprite/BitmapText/RenderTexture), the Liquid Glass shader is the only architecturally complex piece. Revisit for v1.5/v2.0 if bundle size becomes a competitive issue or WebGPU is wanted.
- **Generic templates (per-instance type binding) — PARKED:** today's templates are inner-driven (definition owns the type). Will need design when concrete use-cases land.
