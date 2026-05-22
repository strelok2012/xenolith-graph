# ADR-0002: Headless core, layered architecture

**Status:** Accepted
**Date:** 2026-05-22

## Context

Most web node-editor libraries grow into a tangle: graph state lives inside React components, rendering state lives inside Canvas callbacks, interaction handlers mutate the DOM directly. Replacing the rendering backend, testing without a browser, or building a second framework adapter then becomes prohibitively expensive.

We need a structure that allows:

- Unit-testing graph logic, type rules, and command application without spinning up a browser.
- Replacing the renderer (PIXI v8 today, possibly Canvas2D or WebGPU-native later) without touching graph logic.
- Adding React, Vue, and Svelte adapters that are genuinely thin — no logic of their own, just reactivity bridges.
- A future collaborative-editing layer that sits between the command bus and the network without rewriting the engine.

## Decision

Adopt a strict four-layer architecture:

1. **Core** — headless graph model, type system, command bus, event emitter. Zero runtime dependencies. No imports from DOM, Canvas, PIXI, or any framework.
2. **Renderer / Interaction / Plugin host** — sit on top of Core. The Renderer knows PIXI; Interaction knows pointer/keyboard events; Plugin host knows nothing specific. None of them know about React or any other framework.
3. **Editor** — composes the layers below into a working editor instance.
4. **Framework adapters** — thin wrappers that bridge framework reactivity to the core event bus.

**Strict import rule:** an upper layer may import from any layer below it. A lower layer may **never** import from a layer above it. This is enforced in CI via import-boundary lint rules.

## Consequences

- The core package can be unit-tested with Vitest in Node without jsdom or a browser.
- Adding a new renderer (e.g. `@xenolith/render-canvas` for low-end environments) means implementing one interface, not rewriting the engine.
- Adding a new framework adapter is a ~200-line task.
- Core has no access to convenient browser APIs (window, requestAnimationFrame, ResizeObserver). When it needs scheduling or time, it receives them as injected dependencies from the editor layer.

## Reconsider if

- A concrete need arises that genuinely cannot be served without leaking a higher-layer concept into Core. (To date, none of the planned features require this.)
