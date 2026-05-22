# ADR-0003: Zero runtime dependencies in `@xenolith/core`

**Status:** Accepted
**Date:** 2026-05-22

## Context

`@xenolith/core` is loaded by every consumer of the library — the PIXI renderer, the editor, every framework adapter, every plugin, and any future alternative renderer. Any transitive dependency it picks up is paid for by every user, in bundle size and in surface area for supply-chain risk.

Two specific candidates were considered:

- **Mitt** (~200 bytes) — popular tiny event emitter.
- **nanoevents** — similar.

Both work. Both are trivial to replace with ~30 lines of typed code.

## Decision

`@xenolith/core` ships with **zero runtime dependencies**. Every primitive it needs (event emitter, deep clone, ID generation, observable maps) is implemented in-package or imported from standard ECMAScript / Web Platform APIs available in the target runtimes (Node ≥ 20, browsers ≥ 2023).

The renderer, editor, and adapter layers may add dependencies, but each new dependency must be justified in its PR.

## Consequences

- We write our own `EventEmitter`, `Quadtree`, `UUID v7` generator, and similar small utilities. These are clearly contained, have tests, and avoid version-skew bugs.
- `@xenolith/core` is bundle-size-bounded by our own code alone. The 30 kB gzip CI budget becomes meaningful.
- A security advisory against any external dependency cannot touch core.
- Onboarding contributors involves zero "why is this library here" archaeology in core.

## Reconsider if

- A future feature in core (e.g. CRDT for collab) cannot be implemented at competitive performance without a dependency, and the dependency has long-term maintenance and security guarantees.
