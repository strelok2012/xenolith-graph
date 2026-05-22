import tokens from './tokens.json' with { type: 'json' }
import type { XenTokens } from './types.js'

export const xenTokens = tokens as unknown as XenTokens

export const VERSION = xenTokens.version

export type { XenTokens, PinTypeToken, CategoryToken, StateStyle, PinShape } from './types.js'
