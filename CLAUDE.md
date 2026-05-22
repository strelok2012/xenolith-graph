# XenolithGraph

Open-source embeddable node-graph editor for the web with **Unreal Engine Blueprint-style aesthetic and UX as first-class**, not a theme on top of a generic flowchart library.

Working name: **XenolithGraph** (subject to change before v0.1).

## Why this exists

The web node-graph space in 2026 is split between two camps:

- **Generic flowchart libraries** (xyflow / React Flow ~36k★, Rete.js ~12k★, Drawflow ~6k★) — framework or framework-agnostic, but visually neutral. Every LLM-workflow tool (LangFlow, Flowise, Dify) looks identical because they all sit on React Flow.
- **One semi-Blueprint library** — LiteGraph.js (~8k★, the engine behind ComfyUI). Declares "UDK Blueprint-like" but the aesthetic is mid-2010s, Canvas2D-only, no TypeScript, single maintainer, no framework adapters.

There is **no open-source library that delivers an actual UE4/UE5 Blueprint look and UX out of the box** while being modern (TypeScript, ESM, WebGL, framework-agnostic, plugin-based). XenolithGraph aims to fill that gap.

Primary target users: AI/LLM workflow builders, audio/DSP graph editors, shader/material editors, gameplay-logic editors, anyone who wants a node UI that looks like a tool rather than a diagram.

## Non-goals

- Not a generic flowchart library. Blueprint semantics (typed pins, exec vs data, type-color system, K2-style search palette) are first-class, not opt-in.
- Not a runtime. The library renders and edits graphs; executing them is a separate concern handled by the host application.
- Not coupled to Unreal Engine, `.uasset`, or any game engine. The aesthetic is borrowed, the format is not.
- Not React-only. React/Vue/Svelte get adapters; the core is framework-agnostic.

## Architecture (planned)

Layered, headless-first:

```
┌──────────────────────────────────────────────────────────────┐
│ Framework adapters (React / Vue / Svelte / vanilla)          │
├──────────────────────────────────────────────────────────────┤
│ Editor — composes Renderer + Interaction + Commands + Plugins│
├─────────────────────┬────────────────────┬───────────────────┤
│ Renderer (PIXI v8)  │ Interaction        │ Plugin host       │
├─────────────────────┴────────────────────┴───────────────────┤
│ Core (headless: model · types · commands · events · zero-dep)│
└──────────────────────────────────────────────────────────────┘
```

The strict rule: a layer may know about layers below it, never above. The core has zero runtime dependencies and zero references to DOM, Canvas, or PIXI.

### Planned packages (pnpm monorepo)

| Package | Role |
|---|---|
| `@xenolith/core` | Headless graph model, type system, command bus, events. Zero deps. |
| `@xenolith/render-pixi` | PIXI v8 renderer. PIXI is a peer dependency. |
| `@xenolith/editor` | Wires core + renderer + interaction + plugins into a usable editor. |
| `@xenolith/react`, `@xenolith/svelte`, `@xenolith/vue` | Thin adapters. |
| `@xenolith/theme-ue5`, `@xenolith/theme-ue4` | Default themes (UE5 is the out-of-box default). |
| `@xenolith/plugin-*` | Minimap, search palette, undo, serialize, clipboard, alignment. |

### Tooling baseline

- pnpm workspaces + Turbo for the monorepo.
- TypeScript-first, ESM-only, no CommonJS output.
- Vite for builds, Vitest for unit tests, Playwright for interaction E2E, snapshot tests for renderer output.
- Changesets for versioning and releases.
- MIT license.

### Performance invariants (CI-enforced from day one)

Without hard perf gates this becomes the next slow node library. Targets:

- 500 nodes / 1000 edges at 60fps on Apple Silicon / Ryzen 5.
- 0 GC pauses during a 5-second drag.
- Cold-start with 100 nodes under 100 ms.
- `@xenolith/core` bundle < 30 kB gzip; `@xenolith/render-pixi` < 80 kB gzip (excluding PIXI as a peer).

CI fails on regression.

## Core data model (sketch)

```ts
interface Graph {
  nodes: Map<NodeId, Node>
  edges: Map<EdgeId, Edge>
  comments: Map<CommentId, Comment>
}

interface Pin {
  id: PinId
  kind: 'exec' | 'data'         // first-class Blueprint distinction
  direction: 'in' | 'out'
  type: TypeId                  // 'float', 'string', 'object:User', 'exec', ...
  multiple: boolean
}

interface TypeDescriptor {
  id: TypeId
  color: string                 // UE5 type-color palette
  shape: 'circle' | 'diamond' | 'arrow'
  cast?: (v: unknown) => unknown
  compatibleWith?: TypeId[]
}
```

All mutations flow through a `CommandBus` (every change is an `apply/undo` pair). This buys undo/redo, replay, deterministic tests, and a path to collaborative editing without rewriting later.

## Roadmap

- **v0.1** — core + render-pixi + editor MVP. Nodes, pins, edges, pan/zoom, selection, drag. No undo, no palette. Vite playground demo.
- **v0.2** — typed pins, connection validation, UE5 theme, K2-style Tab palette, undo, JSON serialization.
- **v0.3** — comments, reroute nodes, copy/paste, minimap, search plugin.
- **v0.4** — React / Vue / Svelte adapters, docs site, landing page.
- **v0.5** — LLM-workflow showcase (a visibly better-looking LangFlow clone built on Xenolith). This is the launch artifact for Twitter / HN.
- **v1.0** — stable API, frozen file format, CI-enforced perf budgets.

## Conventions for contributors (and Claude)

- **No comments unless the *why* is non-obvious.** Identifiers explain the *what*. Don't add JSDoc to functions whose name says it all.
- **No backwards-compat shims** until v1.0. Until then, breaking changes go in changesets with a clear migration note.
- **No new dependencies in `@xenolith/core` ever.** Headless core stays zero-dep. Render and adapter layers may add deps but each addition needs justification in the PR.
- **Every public API change ships with a Vitest test.** Every interaction change ships with a Playwright test.
- **Perf budgets are not advisory.** A PR that blows the budget either fixes it or gets reverted.
- **Don't reinvent UE Blueprint UX.** When in doubt how something should feel (palette behaviour, pin hover halo, drag-from-pin to empty space behaviour), open UE5 editor and copy it. The recognizability is the product.

## Status

Pre-v0.1. Architecture under discussion; no code committed yet. See conversation history with Claude (or future ADRs under `docs/adr/`) for design decisions in flight.
