export type PinShape = 'circle' | 'circle-empty' | 'chevron'

export interface PinTypeToken {
  label: string
  color: string
  shape: PinShape
  edgeColor: string
  edgeWidth: number
  note?: string
}

export interface CategoryToken {
  label: string
  accent: string
  gradient: string
}

export interface StateStyle {
  border?: string
  borderWidth?: number
  glow?: string
  glowBlur?: number
  opacity?: number
}

export interface XenTokens {
  name: 'xen'
  version: string
  color: {
    brand: Record<string, string>
    surface: Record<string, string>
    text: Record<string, string>
    alpha: Record<string, string>
  }
  pinType: Record<string, PinTypeToken>
  category: Record<string, CategoryToken>
  pill: Record<string, string>
  state: {
    hover: StateStyle
    selected: StateStyle
    active: StateStyle
    disabled: StateStyle
  }
  geometry: {
    node: Record<string, number>
    pin: Record<string, number | string>
    header: Record<string, number>
    edge: Record<string, number | boolean>
    comment: Record<string, number>
  }
  typography: {
    fontFamily: string
    heading: TypographyStyle
    label: TypographyStyle
    comment: TypographyStyle
  }
  effect: {
    headerInnerShadow: ShadowStyle
    pillInnerShadow: ShadowStyle
    headerBackdropBlur: number
    pillBackdropBlur: number
    headerHighlightGradient: string
    headerHighlightStroke: string
  }
  background: {
    color: string
    grid: { kind: 'dots' | 'lines'; spacing: number; size: number; color: string }
  }
  edgeRouting: { rule: string; note: string }
}

export interface TypographyStyle {
  size: number
  weight: number
  lineHeight: number
  color: string
  tracking: number
}

export interface ShadowStyle {
  offsetX: number
  offsetY: number
  blur: number
  color: string
}
