# ADR-0001: PIXI v8 as the default renderer

**Status:** Accepted
**Date:** 2026-05-22

## Context

XenolithGraph needs a 2D rendering backend capable of holding 60 fps on a 500-node / 1000-edge graph while drawing rich visual detail (gradients, glows, shader-driven exec-edge pulse). The renderer must be replaceable in a future version without rewriting the rest of the library.

Candidates considered:

| Engine | Verdict |
|---|---|
| **PIXI v8** | Mature 2D WebGPU/WebGL2 engine. Built-in scene graph, filters, BitmapText, hit-test. Active maintenance, large community, accepted in production at scale. |
| Konva.js | Canvas2D only. Loses the perf race we exist to win. |
| Two.js | Multi-backend but the scene graph and interactivity layer are too thin; we would write nearly all the editor primitives ourselves. |
| OGL | ~10 kB, fast, but a raw WebGL wrapper. No 2D abstractions, text, or hit-test. Costs us several months of foundational work. |
| Raw WebGPU / WebGL | Total control; total time sink. Not justified before v2.x. |
| Skia / CanvasKit | 7+ MB WASM. Disqualifies for an embeddable library. |
| HTML/CSS + SVG | The model React Flow uses; the model whose limits motivate this project. |

## Decision

Use **PIXI v8** as the renderer backend. It is **a peer dependency** of `@xenolith/render-pixi` — never bundled — so applications already shipping PIXI don't pay twice.

## Consequences

- We accept PIXI's API surface as part of our development experience and tooling.
- Renderer-specific code lives strictly inside `@xenolith/render-pixi`. Core and editor layers never import PIXI types.
- If a future user needs a non-PIXI build (e.g. Canvas2D-only for an embedded environment), they can write `@xenolith/render-canvas` against the same renderer interface defined by the editor.
- Bundle budget for `@xenolith/render-pixi`: < 80 kB gzip excluding PIXI. PIXI itself is ~250 kB gzip and is the host's responsibility.

## Reconsider if

- PIXI's release cadence stalls for 12+ months.
- A meaningfully smaller 2D engine with comparable features appears.
- WebGPU coverage in major browsers regresses in a way that breaks PIXI v8's WebGPU path (its WebGL2 fallback remains, so this is a soft signal).
