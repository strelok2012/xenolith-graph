# XenolithGraph

Open-source embeddable node-graph editor for the web with **a polished, opinionated node-editor design system as first-class** — not a theme layered on top of a generic flowchart library. The default theme is **Xen**, an original dark/gold design language defined in Figma.

Working name: **XenolithGraph** (subject to change before v0.1).

---

## 🚨 TDD IS MANDATORY — NOT OPTIONAL

**Every feature in this repo is written test-first. No exceptions.**

The cycle is **red → green → refactor**:

1. Write a failing Vitest (unit) or Playwright (interaction) test that describes the behaviour you want. Run it. **It must fail for the right reason.**
2. Write the minimum implementation to make the test pass. Run the full test suite. **All tests must be green.**
3. Refactor with the test suite as a safety net. Tests stay green throughout.

Concrete rules:

- **No production code without a failing test first.** If you find yourself writing implementation before a test exists, stop and write the test.
- **Commit message convention:** test-only commits use `test:` prefix; the implementation commit that makes them pass uses `feat:` / `fix:`. The two are usually separate commits so the red→green transition is visible in history.
- **Public API change ⇒ Vitest test.** No exceptions.
- **Interaction change ⇒ Playwright test.** Drag, pan, zoom, pin connect, keyboard — all covered.
- **Visual change ⇒ renderer snapshot test.** PIXI render → PNG → image-diff against committed baseline.
- **Bug fix ⇒ regression test first.** Reproduce the bug as a failing test, then fix.
- **Refactor with zero test changes is the cleanest signal everything is fine.** If a refactor forces a test rewrite, the test was probably coupled to implementation, not behaviour — flag it in the PR.

CI is configured to reject PRs where coverage drops or where any test was skipped/disabled without an issue link.

When Claude works in this repo: **read this section before writing any code in `packages/` or `apps/`.** If a task seems to require implementation without a test, push back and ask. This is the single most important rule in the project.

---

## Why this exists

The web node-graph space in 2026 is split between two camps:

- **Generic flowchart libraries** (xyflow / React Flow ~36k★, Rete.js ~12k★, Drawflow ~6k★) — framework or framework-agnostic, but visually neutral. Every LLM-workflow tool (LangFlow, Flowise, Dify) looks identical because they all sit on React Flow.
- **One semi-Blueprint library** — LiteGraph.js (~8k★, the engine behind ComfyUI). Declares "UDK Blueprint-like" but the aesthetic is mid-2010s, Canvas2D-only, no TypeScript, single maintainer, no framework adapters.

There is **no open-source library that ships a finished, distinctive node-editor design language out of the box** while being modern (TypeScript, ESM, WebGL, framework-agnostic, plugin-based). XenolithGraph aims to fill that gap with the Xen design system.

Primary target users: AI/LLM workflow builders, audio/DSP graph editors, shader/material editors, gameplay-logic editors, anyone who wants a node UI that looks like a tool rather than a diagram.

## Non-goals

- Not a generic flowchart library. Blueprint semantics (typed pins, exec vs data, type-color system, K2-style search palette) are first-class, not opt-in.
- Not a runtime. The library renders and edits graphs; executing them is a separate concern handled by the host application.
- Not coupled to any external engine, file format, or product. The Xen design system is original; references to blueprint-style editors are influence, not reproduction.
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
| `@xenolith/theme-xen` | Default theme (Xen — original design system from the Figma source). |
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
  color: string                 // Xen type-color palette
  shape: 'circle' | 'diamond' | 'arrow'
  cast?: (v: unknown) => unknown
  compatibleWith?: TypeId[]
}
```

All mutations flow through a `CommandBus` (every change is an `apply/undo` pair). This buys undo/redo, replay, deterministic tests, and a path to collaborative editing without rewriting later.

## Roadmap

- **v0.1** — core + render-pixi + editor MVP. Nodes, pins, edges, pan/zoom, selection, drag. No undo, no palette. Vite playground demo.
- **v0.2** — typed pins, connection validation, Xen theme, Tab palette, undo, JSON serialization.
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
- **PIXI shaders / filters: read the docs and source, never guess.** Custom `GlProgram` / `GpuProgram` / `Shader` / `Filter` work must be verified against the actual PIXI v8 source (or live docs at https://pixijs.com/8.x/guides) before writing. GLSL preamble handling, uniform-block conventions, and version-directive prepending differ between APIs and have burned us already. Cheap validation: ship a 5-line dummy shader (`finalColor = vec4(1, 0, 0, 1)`) into the playground and confirm it compiles before scaling up.
- **The Figma source is the canonical visual reference.** When in doubt about a visual choice, the Xen Figma file is the source of truth — not Claude's interpretation, not other editors. Reference assets live in `packages/theme-xen/reference/`. For interaction patterns Figma doesn't cover (palette behaviour, drag-from-pin to empty space, pin hover halo), established blueprint-style editors are useful inspiration, but the visual outcome must match Xen.

## Status

Pre-v0.1. Architecture under discussion; no code committed yet. See conversation history with Claude (or future ADRs under `docs/adr/`) for design decisions in flight.
