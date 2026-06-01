# Contributing to XenolithGraph

Thanks for considering a contribution. This document covers what you need to know to send a PR that lands cleanly.

## TL;DR

- Test-first. Every change starts with a failing test. See [TDD](#tdd-is-mandatory) below — it's not optional.
- Headless `@xenolith/core` stays zero-dep. Render and adapter packages may add deps but each one needs justification in the PR.
- Public API change → Vitest test. Interaction change → Playwright test. Visual change → renderer snapshot.
- Perf budgets in CI are hard gates, not advisory. A PR that blows them either fixes them or is reverted.
- No comments unless the *why* is non-obvious. Identifiers say *what*; comments earn their place by explaining surprises.

## Getting started

```sh
# Requires: Node 20+, pnpm 9+
git clone https://github.com/XenolithEngine/xenolith-graph.git
cd xenolith-graph
pnpm install

# Pick one of these to start hacking:
pnpm --filter @xenolith/playground dev      # http://localhost:5173 — theme switcher + every editor feature
pnpm --filter @xenolith/site dev            # http://localhost:4321/xenolith-graph — docs + landing
pnpm --filter @xenolith/demo-react dev      # http://localhost:5174 — the React showcase apps
```

Useful commands:

```sh
pnpm build                                   # tsc -b across all packages
pnpm test                                    # vitest across all packages
pnpm -w test:e2e                             # playwright (chromium + firefox)
pnpm -w typecheck                            # tsc --noEmit, no build
pnpm changeset                               # add a release note for your change
```

## TDD is mandatory

This repo is written **test-first**. The cycle is **red → green → refactor**:

1. Write a failing Vitest (unit) or Playwright (interaction) test that describes the behaviour you want. Run it — **it must fail for the right reason**.
2. Write the minimum implementation to pass. Run the full suite — **all tests green**.
3. Refactor with tests as your safety net. Tests stay green throughout.

Concrete rules:

- **No production code without a failing test first.** If you find yourself writing implementation before a test exists, stop and write the test.
- **Commit convention.** Test-only commits use `test:` prefix; the implementation commit that makes them pass uses `feat:` / `fix:`. The two are usually separate so the red → green transition is visible in history.
- **Bug fixes ⇒ regression test first.** Reproduce the bug as a failing test, then fix it.
- **PIXI shaders ⇒ docs first.** Don't guess at `GlProgram` / GLSL preamble / uniform-block conventions — verify against PIXI v8 source or the live docs at <https://pixijs.com/8.x/guides>. Cheap validation: ship a 5-line red-fill dummy shader into the playground and confirm it compiles before scaling up.

A refactor with zero test changes is the cleanest signal everything is fine. If a refactor forces a test rewrite, the test was probably coupled to implementation, not behaviour — flag it in the PR.

CI rejects PRs where coverage drops or any test was skipped/disabled without an issue link.

## What kind of change is this?

| Change | Required tests |
|---|---|
| Public editor API (`editor.X(...)`) | Vitest |
| Interaction (drag, pan, zoom, pin connect, keyboard) | Playwright |
| Visual (renderer/theme/layout) | Vitest + renderer PNG snapshot (diff against committed baseline) |
| Bug fix | Vitest reproducing the bug, then the fix |
| Refactor | Existing tests stay green, no rewrite |
| Docs only | None — but check links + spelling |

## Architecture in one paragraph

Layered, headless-first. A layer may know about layers below it, never above.

```
┌──────────────────────────────────────────────────────────────┐
│ Framework adapters (React / Vue / Svelte / Solid / Angular)  │
├──────────────────────────────────────────────────────────────┤
│ @xenolith/editor — composes Renderer + Interaction + Plugins │
├─────────────────────┬────────────────────┬───────────────────┤
│ @xenolith/render-pixi│  Interaction       │  Plugin host     │
├─────────────────────┴────────────────────┴───────────────────┤
│ @xenolith/core (headless: model, types, commands, events)    │
└──────────────────────────────────────────────────────────────┘
```

Full picture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Design decisions: [`docs/adr/`](docs/adr/).

## Perf invariants (CI-enforced)

| Budget | Target |
|---|---|
| 500 nodes / 1000 edges | 60fps on Apple Silicon / Ryzen 5 |
| 5-second drag | 0 GC pauses |
| Cold start with 100 nodes | < 100 ms |
| `@xenolith/core` bundle | < 30 kB gzip |
| `@xenolith/render-pixi` bundle | < 80 kB gzip (excluding PIXI as a peer) |

CI fails on regression. If your change blows the budget, either fix it in the same PR or open a discussion before merging.

## PR checklist

- [ ] Tests added (red → green visible in the commit history).
- [ ] `pnpm test` and `pnpm -w typecheck` pass locally.
- [ ] If you touched the renderer/theme: snapshot baselines updated and visually reviewed.
- [ ] If you added or changed a public API: an entry was added to the changeset (`pnpm changeset`).
- [ ] CLAUDE.md / ADRs updated if the change affects how future contributors should reason about the code.
- [ ] No new deps in `@xenolith/core` (zero-dep is enforced).
- [ ] Bundle-size budget respected for the touched packages.

## Code style

- TypeScript strict, ESM only, no CommonJS output.
- No comments unless the *why* is non-obvious. Identifiers explain the *what*.
- No backwards-compat shims pre-v1.0. Breaking changes ship in a changeset with a migration note.
- Don't add features, refactors, or abstractions beyond what the issue requires. A bug fix doesn't need surrounding cleanup; three similar lines beats a premature abstraction.
- Don't add error handling, fallbacks, or validation for scenarios that can't happen. Trust internal code; validate at system boundaries only.

## Releasing

Releases are managed through [Changesets](https://github.com/changesets/changesets). When you change a public API:

```sh
pnpm changeset
```

Pick the affected packages, the bump type (patch/minor/major), and write the user-facing changelog entry. CI handles the rest on merge to `main`.

## Reporting bugs

- Public bugs → [GitHub Issues](https://github.com/XenolithEngine/xenolith-graph/issues). Include a minimal repro (CodeSandbox / repo snippet preferred) and the expected vs. observed behaviour.
- Security issues → see [`SECURITY.md`](SECURITY.md). Don't open public issues for vulnerabilities.

## Getting help

- [Discussions](https://github.com/XenolithEngine/xenolith-graph/discussions) for design questions and "is this the right approach?" before you start coding.
- The Architecture doc and ADRs are the long-form context; the README is the entry point.

Thanks again — every PR makes this thing better.
