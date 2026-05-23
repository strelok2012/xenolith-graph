import { xenTokens, mergeTheme, type XenTokens, type DeepPartial } from '@xenolith/theme-xen'

/**
 * Liquid Glass — Apple WWDC25-inspired material. Translucent body fills, luminous white rims
 * and top highlights, neutral cool backdrop. Geometry, typography, and pin/category colours are
 * inherited from Xen so the graph reads identically — only the *material* of each node changes.
 */
const liquidGlassOverride: DeepPartial<XenTokens> = {
  category: {
    logic:   { accent: '#4D9C75' },
    data:    { accent: '#1B76C9' },
    macro:   { accent: '#5B3FDA' },
    utility: { accent: '#8291B7' },
  },
  color: {
    surface: {
      // Cool, slightly blue dark canvas — gives the glass a subtle warm/cool play.
      canvas:    '#112558',
      // Translucent white — the centrepiece of the look. Reads as frosted card over the canvas.
      node:      'rgba(255, 255, 255, 0.07)',
      panel:     'rgba(255, 255, 255, 0.05)',
      headerEnd: 'rgba(255, 255, 255, 0.18)',
    },
  },
  // Brighter rims and halos read as light bouncing off glass edges.
  state: {
    hover: {
      border:      'rgba(255, 255, 255, 0.85)',
      borderWidth: 1,
      glow:        'rgba(255, 255, 255, 0.55)',
      glowBlur:    6,
      glowWidth:   3,
    },
    selected: {
      border:      'rgba(255, 255, 255, 1)',
      borderWidth: 1.2,
      glow:        'rgba(255, 255, 255, 0.6)',
      glowBlur:    7,
      glowWidth:   3,
    },
    active: {
      border:      'rgba(255, 223, 103, 0.95)',
      borderWidth: 1.2,
      glow:        'rgba(252, 180, 0, 0.75)',
      glowBlur:    8,
      glowWidth:   3,
    },
  },
  effect: {
    // Stronger top-rim highlight — the signature wet-glass shine.
    headerInnerShadow: {
      offsetX: 0,
      offsetY: 3,
      blur:    6,
      color:   'rgba(255, 255, 255, 0.75)',
    },
    headerHighlightGradient:
      'linear-gradient(180deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0) 60%)',
    headerHighlightStroke:
      'linear-gradient(180deg, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0) 100%)',
    // Drop shadow tuned darker to push the glass surface forward against the cool canvas.
    nodeDropShadow: {
      offsetX: 0,
      offsetY: 10,
      blur:    24,
      color:   'rgba(0, 0, 0, 0.55)',
    },
  },
  geometry: {
    node: {
      // Liquid Glass reads as more "soft" with chunkier corners — Apple's WWDC25 sample buttons
      // use ~50% radius on small pills; for our larger node bodies a moderate bump lands well.
      radius:     14,
      pillRadius: 22,
    },
  },
  background: {
    color: '#112558',
    grid: {
      // Subtler dots — they're meant to read *through* the frosted body, not compete with it.
      kind:    'dots',
      spacing: 24,
      size:    1,
      color:   'rgba(255, 255, 255, 0.18)',
    },
  },
}

export const liquidGlassTokens: XenTokens = mergeTheme(xenTokens, liquidGlassOverride)
