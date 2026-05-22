# @xenolith/test-fixtures

Real-world graph fixtures used by XenolithGraph tests, benchmarks, and demos. Internal package — `private: true`, not published to npm.

## Current fixtures

| ID | Format | Size | Nodes | Links | Bytes |
|---|---|---:|---:|---:|---:|
| `litegraph/s-basic` | LiteGraph (ComfyUI) | S | 11 | 76 | 8.9 KB |
| `litegraph/m-lora-upscale` | LiteGraph (ComfyUI) | M | 26 | 113 | 21 KB |
| `litegraph/l-token-random` | LiteGraph (ComfyUI) | L | 79 | 88 | 63 KB |
| `litegraph/xl-model-compare` | LiteGraph (ComfyUI) | XL | 171 | 374 | 137 KB |
| `litegraph/xxl-prompt-diff` | LiteGraph (ComfyUI) | XXL | 230 | 702 | 363 KB |

All five are sourced from [wyrde/wyrde-comfyui-workflows](https://github.com/wyrde/wyrde-comfyui-workflows) (MIT licence — see `MANIFEST[].source` for direct file URLs and `MANIFEST[].license` for the licence of each fixture).

## Usage

```ts
import { listFixtures, loadFixture, MANIFEST } from '@xenolith/test-fixtures'

// List everything (or filter by format/size)
const small = listFixtures({ size: 's' })

// Load a fixture
const data = await loadFixture('litegraph/xxl-prompt-diff')
```

The `xxl-prompt-diff` fixture is the **canonical stress benchmark**: 230 nodes / 702 links. Perf budgets in CI (see [ADR-0001](../../docs/adr/0001-pixi-v8-renderer.md)) reference this fixture by name.

## Adding new fixtures

1. Drop the file under `fixtures/<format>/<size>-<descriptive-name>.json`.
2. Add a row to `src/manifest.ts` with accurate `nodes` / `links` / `bytes` / `source` / `license`.
3. The integrity test (`every fixture in the manifest is actually loadable`) will catch most paste errors automatically.

## Layout

```
packages/test-fixtures/
├── fixtures/
│   └── litegraph/
│       ├── s-basic.json
│       ├── m-lora-upscale.json
│       ├── l-token-random.json
│       ├── xl-model-compare.json
│       └── xxl-prompt-diff.json
└── src/
    ├── index.ts          (listFixtures / findFixture / loadFixture)
    ├── manifest.ts       (FixtureRecord, MANIFEST)
    └── index.test.ts     (integrity tests)
```
