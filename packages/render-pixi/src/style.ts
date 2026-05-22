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

export function resolveCategoryAccent(category: string | undefined, tokens: XenTokens): string {
  return lookupCategory(category, tokens.category)?.accent ?? tokens.category.utility.accent
}

export function resolvePinFill(pinType: string, tokens: XenTokens): string | null {
  const known = lookupPin(pinType, tokens.pinType)
  if (known) {
    return known.shape === 'circle-empty' ? null : known.color
  }
  return tokens.pinType.any.color
}

export function resolvePinStroke(pinType: string, tokens: XenTokens): string {
  const known = lookupPin(pinType, tokens.pinType)
  if (known?.shape === 'circle-empty') return known.color
  return tokens.geometry.pin.strokeColor
}

export function resolveEdgeColor(sourceType: string, tokens: XenTokens): string {
  return lookupPin(sourceType, tokens.pinType)?.edgeColor ?? tokens.pinType.any.edgeColor
}

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.startsWith('#') ? hex.slice(1) : hex
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

export interface CategoryGradient {
  start: string
  end: string
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
): CategoryGradient {
  const accent = resolveCategoryAccent(category, tokens)
  return {
    start: hexToRgba(accent, 0.6),
    end: hexToRgba(accent, 0),
  }
}
