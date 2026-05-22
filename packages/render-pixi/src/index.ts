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
export type { RenderNodeOptions, NodeView, NodeVisualState } from './node-renderer.js'

export { renderEdge, drawEdge } from './edge-renderer.js'
export type { RenderEdgeOptions } from './edge-renderer.js'

export {
  screenToWorld,
  worldToScreen,
  zoomAt,
  clampZoom,
  snapToGrid,
  computeDragTarget,
} from './viewport-math.js'
export type { ViewportState, ZoomBounds, Vec2 as ViewportVec2 } from './viewport-math.js'

export { Viewport } from './viewport.js'
export type { ApplyTarget } from './viewport.js'

export { InteractionManager, wheelDeltaToZoomFactor } from './interaction.js'
export type { InteractionManagerOptions } from './interaction.js'

export { createGridSprite } from './grid.js'

export { rectFromPoints, rectIntersects, nodeBounds } from './geom.js'
export type { Rect as GeomRect, Vec2 as GeomVec2, NodeBoundsTokens } from './geom.js'
