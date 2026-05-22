# XenolithGraph

Open-source embeddable node-graph editor for the web with **a polished, opinionated node-editor design system as first-class** — not a theme layered on top of a generic flowchart library.

> **Status:** pre-v0.1. Architecture locked in (see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)); implementation in progress.

## Why

The web node-graph space in 2026 is split between **visually neutral flowchart libraries** (React Flow, Rete, Drawflow) and **one semi-blueprint library** (LiteGraph.js) that is Canvas2D-only, vanilla JS, and aesthetically frozen in the mid-2010s. There is no modern, TypeScript-first, WebGL-rendered, framework-agnostic library that ships with a finished, distinctive design language out of the box — every LangFlow / Flowise / Dify looks identical because they all sit on React Flow.

XenolithGraph fills that gap. Its default theme — **Xen** — is an original dark/gold design system with typed pins, exec/data distinction, category-coloured headers, and glass-effect rendering, built for AI/LLM workflow tools, audio/DSP graphs, shader editors, and anywhere a node UI should look like a tool rather than a diagram.

## Packages

| Package | Status |
|---|---|
| `@xenolith/core` | v0.1 (planned) |
| `@xenolith/render-pixi` | v0.1 (planned) |
| `@xenolith/editor` | v0.1 (planned) |
| `@xenolith/theme-xen` | v0.2 (planned) — default theme |
| Plugins (`search`, `undo`, `serialize`, …) | v0.2–v0.3 (planned) |
| Framework adapters (`react`, `vue`, `svelte`) | v0.4 (planned) |

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full layout and roadmap, and `docs/adr/` for individual decision records.

## Development

```sh
pnpm install
pnpm playground   # launches the dev sandbox
pnpm test
pnpm build
```

## License

MIT
