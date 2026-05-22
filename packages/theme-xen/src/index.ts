import tokens from './tokens.json' with { type: 'json' }
import type { XenTokens } from './types.js'

export const xenTokens = tokens as unknown as XenTokens

export const VERSION = xenTokens.version

export { loadXenFonts } from './fonts.js'
export { mergeTheme } from './merge.js'
export type { DeepPartial } from './merge.js'

export type {
  XenTokens,
  XenCategoryMap,
  XenPinTypeMap,
  XenSurfaceColors,
  PinTypeToken,
  CategoryToken,
  StateStyle,
  PinShape,
  TypographyStyle,
  ShadowStyle,
} from './types.js'
