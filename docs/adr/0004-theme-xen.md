# ADR-0004: Xen — original design system, not a UE5 reproduction

**Status:** Accepted
**Date:** 2026-05-22

## Context

Early architecture drafts referred to the default theme as `theme-ue5` and framed XenolithGraph as delivering a "UE5 Blueprint look." This was wrong for two reasons:

1. **Visual.** The design system this project actually ships — defined in Figma, with the namespace `xen/...` (categories, gradients, typography) — is its own thing. The colour palette is darker, the accent is gold-yellow, the headers are glassmorphic with backdrop blur, and there is a unique "pill" collapsed-summary node form that has no Unreal counterpart.
2. **Strategic.** Pitching the library as a UE reproduction caps it at "the UE-on-the-web library." Pitching it as a polished original design system for any node-based UI (AI/LLM workflow, audio/DSP, shader, generic dataflow) opens the entire AI tooling market — where competitors all sit on visually neutral React Flow and look identical.

## Decision

The default theme is **Xen**, an original design system. The package is `@xenolith/theme-xen`. The Figma source is the canonical authority.

### Visual invariants

- **Four category accents** for node headers, glassmorphic gradient + inset highlight + backdrop blur:
  - `logic` — green `#85C244`
  - `data` — blue `#3E95B9`
  - `macro` — purple `#8A38F5`
  - `utility` — white `#FFFFFF`
- **Six pin types**, each with a fixed colour, shape, and edge-colour:
  - `exec` — yellow `#FCB400`, chevron shape, edge width 3 (imperative flow)
  - `float` — green `#85C244`, circle
  - `object` — blue `#3E95B9`, circle
  - `string` — orange `#FF5622`, circle
  - `any` — white `#FFFFFF`, circle
  - `wildcard` — cyan `#9AD6E3`, **outline only**, no fill (typed but unconnected)
- **Edge colour follows the source pin's type colour.** Invariant — per-edge overrides allowed only for special UI states (error highlight). No theme override may break this rule.
- **State styling**:
  - hover — 1 px brand-yellow border `#FCB400` + soft yellow glow `rgba(252,180,0,0.3)`
  - selected — 1 px white border + soft white glow `rgba(255,255,255,0.15)`
- **Pill nodes** — the collapsed-summary form. 140×40, 20 px radius, horizontal accent gradient with the type colour in the middle, pins on the ends, rotated chevron icon.

### Backdrop blur — implementation rule

Glassmorphic headers use `backdrop-filter: blur(4px)` semantically. Implementation rule (see ADR-0001 perf budgets):

- Headers are **rasterized once per category accent at theme load** into PIXI `RenderTexture`s.
- All node headers of the same category share that texture via sprite instancing.
- Blur is **never recomputed per frame**.
- At zoom < 50% the blurred texture is swapped for a flat-gradient fallback (LOD).
- This keeps the visual identical to a real backdrop blur while costing zero per-frame GPU work.

## Consequences

- `@xenolith/theme-ue5` and `@xenolith/theme-ue4` are removed from the package map. Future alternative themes — light, high-contrast, brand-customised — live under `@xenolith/theme-*` post-1.0.
- The README, ARCHITECTURE.md, and CLAUDE.md pitch the project around the Xen design system, not around Unreal Engine.
- Visual references live under `packages/theme-xen/reference/` and are treated as ground truth in code review. A PR that ships a visual change without updating the reference frame is incomplete.
- Other blueprint-style editors (UE5, ComfyUI, Blender geo nodes) remain useful **interaction** references — but only where Figma is silent and visual outcomes must still match Xen.

## Reconsider if

- The Figma source is ever fully replaced by a new design system. In that case, this ADR is rewritten or superseded by a new one for the replacement.
