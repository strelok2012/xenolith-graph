# XenolithGraph

An embeddable, drop-in node-graph editor for the web with a polished design system inside the package — typed Blueprint pins, live templates, macros, in-node widgets, a plugin host — and a swappable theme architecture that replaces the renderer's material entirely, not just its palette.

> **Status:** approaching v1.0. Public API stable; touch/mobile, Vue/Svelte/Solid adapters, and the Blueprint VM runtime (`@xenolith/plugin-runtime`) land before the freeze.

<p>
  <img src="docs/screenshots/xen.png" alt="Xen — default dark/gold theme" width="49%" />
  <img src="docs/screenshots/liquid-glass.png" alt="Liquid Glass — shader-based frosted theme" width="49%" />
</p>

## What it does

```ts
import { XenolithEditor } from '@xenolith/editor'

const editor = await XenolithEditor.init('#app')
editor.loadJSON(graphDoc)
editor.fitView()
```

One async call boots: fonts, PIXI v8 renderer, viewport, grid, pan/zoom, marquee, multi-drag with snap, connect-pins-by-drag, `Alt`+drag rewire, two reroute kinds, comments, collapsed macros, live templates with dive-in editing, in-node widgets, K2-style Tab palette, undo/redo, JSON serialize, minimap. Headless `@xenolith/core` is zero-dependency.

## Highlights

- **Blueprint-first.** Typed pins (`exec` vs `data`), per-type color and shape (`circle` / `arrow` / `diamond`), `compatibleWith` for auto-cast. Exec pins hoist onto the node header line (UE-Blueprint layout) when a node has one. Header glyphs from a Feather icon set or your own SVG.
- **Live templates.** Reusable sub-graphs with a stored definition + many instances. Edit the definition (`Cmd+Shift+G` to create, double-click to dive in) and every instance updates. Convert back-and-forth: template → group, group → template (carries nested macros). Unpack inlines a copy.
- **Collapsed macros.** `Cmd+G` packs the selection into one wrapper with proxy pins on its border. Inline, no shared definition — for one-off grouping. Round-trips through the file format.
- **Comments.** Drag a coloured rectangle behind nodes; spatial group-drag — anything inside moves with it. Tab → "Comment" or context menu.
- **In-node widgets.** Declarative `number` / `slider` / `combo` / `text` / `toggle` / `color` / `button`, plus custom canvas-draw or DOM-mount widgets. React/Vue/Svelte components mount inline through `registerWidget(name, controller)`.
- **Plugin host.** `editor.use(plugin)` with a `PluginContext` that exposes schema/types/icons/widgets, an event bus, and a runtime-delegation surface (`onTick`, `setNodePins`, `setWidgetValue({ephemeral})`, `expandTemplateInstance`, `graphSnapshot`, `setEdgeAnimated`) for execution plugins. The in-progress `@xenolith/plugin-runtime` is the canonical consumer — a Blueprint VM.
- **Two themes shipped.** Xen (dark/gold, original design system) and Liquid Glass (shader-based refraction + rim lighting via PIXI Mesh+Shader). Swap at runtime with `editor.setTheme(theme)`.
- **Perf for real graphs.** Viewport virtualization + 3-tier LOD (full → sprite-baked → flat-batch). Render-on-demand (static graphs idle at 0 fps cost). Shared GPU texture caches. Tested at 58k nodes; ~4–7 ms/frame at 40k+ on M1.
- **React adapter.** `<XenolithPanel>`, `<XenolithControls>`, `<XenolithMiniMap>`, `<XenolithButton>`, reactive selector hooks, editor context. Other frameworks via `@xenolith/wc` until dedicated adapters land.

## Theming

A `XenolithTheme` bundles design tokens, an optional custom `renderNode`, and an optional `createGrid` for the canvas backdrop. Themes swap at runtime through `editor.setTheme(theme)` and re-render every node in place; selection, hover, collapse state, positions are preserved.

```ts
import { xenTheme } from '@xenolith/render-pixi'
import { liquidGlassTheme } from '@xenolith/theme-liquid-glass'

editor.setTheme(liquidGlassTheme)   // instant — every node re-rendered, state preserved
editor.setTheme(xenTheme)
```

The shader-heavy backdrop pass is **opt-in per theme** (`theme.needsBackdrop`) — Xen pays zero extra render cost; Liquid Glass turns it on automatically.

## Roadmap

| Milestone | What |
|---|---|
| **shipped** | Core + renderer + editor, Xen + Liquid Glass themes, typed pins, K2 palette, undo, `xenolith.v1` JSON, comments, two reroute kinds, edge-midpoint context menu, copy/paste, minimap, widgets, macros, live templates with dive-in editing, plugin host, header glyphs, UE-Blueprint exec-on-header, viewport virtualization + LOD, React adapter + hooks, Liquid Glass theme. |
| **v0.6 → v1.0** | `@xenolith/plugin-runtime` (Blueprint VM), Vue/Svelte/Solid adapters, touch/mobile (pinch-zoom + long-press), accessibility (ARIA + keyboard nav), auto-layout plugin (ELK/Dagre), public API + format freeze. |
| **opt-in / on-demand** | Yjs collab adapter, orthogonal edge routing, custom WebGL renderer (PIXI replacement). |

## Packages

| Package | Role |
|---|---|
| `@xenolith/core` | Headless graph model, types, command bus, events, plan-* helpers for macros/templates/reroutes. Zero deps. |
| `@xenolith/render-pixi` | PIXI v8 renderer (nodes, edges, comments, macros, widgets, glyphs, LOD). PIXI is a peer dependency. |
| `@xenolith/editor` | Composes renderer + interaction + commands + plugin host. The public entry point. |
| `@xenolith/theme-xen` | Default Xen design tokens, bundled Inter fonts. |
| `@xenolith/theme-liquid-glass` | Liquid Glass theme — radial backdrop + GLSL Mesh material. |
| `@xenolith/demo` | One `xenolith.v1` data graph + ComfyUI importer + topology-reactive runners. Consumed by every demo host. |
| `@xenolith/adapter-core`, `@xenolith/wc` | Framework-agnostic editor wrapper + universal web component. |
| `@xenolith/react` | React adapter (`<XenolithPanel>` / `<XenolithControls>` / `<XenolithMiniMap>` / `<XenolithButton>`, reactive selector hooks). |
| `@xenolith/plugin-runtime` *(in progress)* | Blueprint VM (exec-push + pure-pull, `Allocate` verb). Installs via `editor.use()`. |

## Develop

```sh
pnpm install
pnpm --filter @xenolith/playground dev      # localhost:5173, includes a theme switcher
pnpm --filter @xenolith/site dev            # the docs + landing site (Astro Starlight)
pnpm test                                    # vitest across all packages
pnpm -w test:e2e                             # playwright (chromium + firefox)
pnpm build                                   # tsc -b across all packages
```

Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). ADRs: [`docs/adr/`](docs/adr/). Public API guide: [docs site](apps/site).

## License

MIT.
