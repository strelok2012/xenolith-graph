export const VERSION = '0.0.0'

export { computeNodeLayout } from './layout.js'
export type { LayoutTokens, NodeLayout, PinLayout, Rect } from './layout.js'

export { computeEdgePath, sampleBezier } from './bezier.js'
export type { EdgePath, EdgeTokens, Vec2 } from './bezier.js'

export {
  resolveCategoryAccent,
  resolvePinFill,
  resolvePinStroke,
  resolveEdgeColor,
  resolveCategoryGradient,
  hexToRgba,
} from './style.js'
export type { CategoryGradient } from './style.js'

export { renderNode } from './node-renderer.js'
export type { RenderNodeOptions } from './node-renderer.js'

export { renderEdge } from './edge-renderer.js'
export type { RenderEdgeOptions } from './edge-renderer.js'
