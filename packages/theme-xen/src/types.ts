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
  /** Width of the stroke that seeds the blurred glow halo. Wider stroke = brighter halo at
   *  equal alpha (more source energy under the gaussian). Default 3. */
  glowWidth?: number
  opacity?: number
}

export interface XenSurfaceColors {
  canvas: string
  node: string
  panel: string
  elevated: string
  muted: string
  subtle: string
  outline: string
  divider: string
  headerEnd: string
}

export interface XenPinTypeMap {
  exec: PinTypeToken
  float: PinTypeToken
  object: PinTypeToken
  string: PinTypeToken
  any: PinTypeToken
  wildcard: PinTypeToken
}

export interface XenCategoryMap {
  logic: CategoryToken
  data: CategoryToken
  macro: CategoryToken
  utility: CategoryToken
}

export interface XenTokens {
  name: 'xen'
  version: string
  color: {
    brand: Record<string, string>
    surface: XenSurfaceColors
    text: { primary: string; secondary: string; muted: string; disabled: string }
    alpha: Record<string, string>
    minimap: {
      background: string
      border: string
      node: string
      frame: string
      frameBorder: string
    }
    widget: {
      bg: string
      bgHover: string
      bgFocused: string
      track: string
      fill: string
      fillAlpha: number
      text: string
      label: string
      placeholder: string
      border: string
      borderFocused: string
      selection: string
      knob: string
    }
  }
  pinType: XenPinTypeMap
  category: XenCategoryMap
  pill: Record<string, string>
  state: {
    hover: StateStyle
    selected: StateStyle
    active: StateStyle
    disabled: StateStyle
  }
  geometry: {
    node: {
      radius: number
      minWidth: number
      headerHeight: number
      headerPadding: number
      innerPaddingX: number
      innerPaddingY: number
      pillRadius: number
      pillHeight: number
      pillMinWidth: number
    }
    pin: {
      diameter: number
      stroke: number
      strokeColor: string
      labelGap: number
      rowSpacing: number
      rowHeight: number
      hitPadding: number
      chevronExecWidth: number
      chevronExecHeight: number
    }
    header: {
      toPinsGap: number
      chevronSize: number
      titleGap: number
    }
    edge: {
      width: number
      execWidth: number
      bezierTension: number
      minHorizontalSpread: number
      hitPadding: number
      pulseEnabled: boolean
      midpointRadius: number
      arrowSize: number
    }
    comment: {
      /** Corner radius. Omit to inherit the node radius (so a comment frame reads 1:1 with a node
       *  header in any theme); set it to deliberately diverge. */
      radius?: number
      headerHeight: number
      minWidth: number
      minHeight: number
    }
    reroute: {
      radius: number
      ringWidth: number
    }
    widget: {
      rowHeight: number
      gap: number
      controlMinWidth: number
      radius: number
      paddingX: number
      paddingY: number
      borderWidth: number
      toggleWidth: number
      toggleHeight: number
    }
    minimap: {
      width: number
      height: number
      margin: number
      radius: number
      padding: number
      borderWidth: number
      nodeRadius: number
    }
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
    nodeDropShadow: ShadowStyle
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
