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
