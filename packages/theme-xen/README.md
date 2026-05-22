# @xenolith/theme-xen

**Xen** — the default original design system for XenolithGraph.

A dark, gold-accented visual language with typed pins (circle / empty-circle / chevron), four category-coloured headers (logic green / data blue / macro purple / utility white), and glassmorphic header effects.

The Figma source is the canonical authority for all visuals. Static reference assets — including the SVG export and screenshots of all node variants — live under `reference/`.

## Usage

```ts
import { xenTokens } from '@xenolith/theme-xen'
import { Editor } from '@xenolith/editor'

const editor = new Editor({ theme: xenTokens })
```

Partial overrides:

```ts
const editor = new Editor({
  theme: {
    ...xenTokens,
    pinType: {
      ...xenTokens.pinType,
      float: { ...xenTokens.pinType.float, color: '#7FE067' },
    },
  },
})
```

## Design rules

- **Edge colour follows the source pin's type colour.** A green-out pin produces a green wire. This is an invariant of the Xen system.
- **Selected nodes** wear a 1 px white border with a soft white glow. **Hovered nodes** wear a 1 px brand-yellow border with a soft yellow glow.
- **Pin shapes carry meaning.** Filled circle — typed value. Empty circle — typed but unconnected (`wildcard`). Chevron — `exec` flow pin.
- **Header backdrop blur** is rendered to a cached texture at theme load — it is not recomputed per frame. See ADR-0004.
- **Pill nodes** are the collapsed-summary form of any standard node, carrying only essential pins and a horizontal accent glow.
