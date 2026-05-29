import type { TypeRegistry } from '@xenolith/core'
import type {
  CategoryToken,
  PinTypeToken,
  XenCategoryMap,
  XenPinTypeMap,
  XenTokens,
} from '@xenolith/theme-xen'

function lookupCategory(name: string | undefined, map: XenCategoryMap): CategoryToken | undefined {
  if (name === undefined) return undefined
  return (map as unknown as Record<string, CategoryToken | undefined>)[name]
}

function lookupPin(name: string, map: XenPinTypeMap): PinTypeToken | undefined {
  return (map as unknown as Record<string, PinTypeToken | undefined>)[name]
}

/** A category colour declared in the graph data (format-first): a single accent colour (header fades
 *  from it) or an explicit gradient. */
export type CategoryColorSpec = { color: string } | { gradient: CategoryGradient }
/** Graph-level category palette, keyed by category name. Overrides the theme's category tokens. */
export type GraphCategoryPalette = Record<string, CategoryColorSpec>

const paletteEntry = (palette: GraphCategoryPalette | undefined, category: string | undefined): CategoryColorSpec | undefined =>
  category === undefined ? undefined : palette?.[category]

/** Accent colour for a category: graph palette (its colour, or a gradient's start) wins over the
 *  theme token, which falls back to the utility accent. */
export function resolveCategoryAccent(category: string | undefined, tokens: XenTokens, palette?: GraphCategoryPalette): string {
  const entry = paletteEntry(palette, category)
  if (entry) return 'gradient' in entry ? entry.gradient.start : entry.color
  return lookupCategory(category, tokens.category)?.accent ?? tokens.category.utility.accent
}

/**
 * Fill colour for a pin's interior. For `circle-empty` (wildcard) pins we return the node body
 * colour so the pin reads as a coloured ring around a solid dark center, not an open hole through
 * which the canvas grid shows. The type-distinctive colour stays on the stroke.
 */
export function resolvePinFill(pinType: string, tokens: XenTokens, types?: TypeRegistry): string {
  const known = lookupPin(pinType, tokens.pinType)
  if (known) {
    return known.shape === 'circle-empty' ? tokens.color.surface.node : known.color
  }
  const custom = types?.get(pinType)
  if (custom) return custom.color
  return tokens.pinType.any.color
}

/**
 * Shape of a pin glyph. A registered {@link TypeRegistry} descriptor's `shape` wins; otherwise the
 * Blueprint default — exec pins are arrows (control flow), data pins are circles.
 */
export function resolvePinShape(
  pinType: string,
  kind: 'exec' | 'data',
  types?: TypeRegistry,
): 'circle' | 'diamond' | 'arrow' {
  const desc = types?.get(pinType)
  if (desc?.shape) return desc.shape
  return kind === 'exec' ? 'arrow' : 'circle'
}

export function resolvePinStroke(pinType: string, tokens: XenTokens): string {
  const known = lookupPin(pinType, tokens.pinType)
  if (known?.shape === 'circle-empty') return known.color
  return tokens.geometry.pin.strokeColor
}

export function resolveEdgeColor(sourceType: string, tokens: XenTokens): string {
  return lookupPin(sourceType, tokens.pinType)?.edgeColor ?? tokens.pinType.any.edgeColor
}

/**
 * Re-emit a colour as `rgba(...)` with the given alpha. Accepts hex (`#RRGGBB` or `#RGB`) or
 * existing `rgb()/rgba()` input — themes can declare translucent surface tokens (e.g. Liquid
 * Glass) and downstream gradient callers don't need to special-case them.
 *
 * Name kept for compatibility; semantically this is `withAlpha(color, a)`.
 */
export function hexToRgba(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha))
  const rgbMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${a})`
  }
  const h = color.startsWith('#') ? color.slice(1) : color
  const expanded = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(expanded.slice(0, 2), 16)
  const g = parseInt(expanded.slice(2, 4), 16)
  const b = parseInt(expanded.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

export interface CategoryGradient {
  start: string
  end: string
}

/** Fade gradient derived from a single accent colour (accent@0.6 → transparent). */
function fadeFrom(accent: string): CategoryGradient {
  return { start: hexToRgba(accent, 0.6), end: hexToRgba(accent, 0) }
}

/**
 * Header gradient stops for a category. Starts at the category accent with 0.6 alpha and fades to
 * full transparency on the right, simulating the Figma source's backdrop-blur + dark-grey-end gradient
 * (which composited over the dark body reads visually as "fades into the body"). Direct opacity fade
 * is the cheap, render-time-friendly approximation.
 */
export function resolveCategoryGradient(
  category: string | undefined,
  tokens: XenTokens,
  palette?: GraphCategoryPalette,
  overrideColor?: string,
): CategoryGradient {
  // Per-node colour wins outright.
  if (overrideColor !== undefined) return fadeFrom(overrideColor)
  // A palette entry: explicit gradient verbatim, or a fade from its colour.
  const entry = paletteEntry(palette, category)
  if (entry) return 'gradient' in entry ? entry.gradient : fadeFrom(entry.color)
  // Otherwise the theme category accent fade (back-compat).
  return fadeFrom(resolveCategoryAccent(category, tokens))
}
