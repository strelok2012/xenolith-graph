export const VERSION = '0.0.0'

export { computeNodeLayout, measureNodeSize } from './layout.js'
export type { LayoutTokens, NodeLayout, PinLayout, Rect, NodeSizeTokens, TextMeasurer } from './layout.js'

export { createPixiTextMeasurer } from './text-measure.js'

export { computeEdgePath, sampleBezier, bezierMidpoint } from './bezier.js'
export type { EdgePath, EdgeTokens, Vec2 } from './bezier.js'

export {
  resolveCategoryAccent,
  resolvePinFill,
  resolvePinStroke,
  resolvePinShape,
  resolveEdgeColor,
  resolveCategoryGradient,
  hexToRgba,
} from './style.js'
export type { CategoryGradient, CategoryColorSpec, GraphCategoryPalette } from './style.js'

export { renderNode, makeHeaderIcon, buildPinShape, readPinHandle, markPinInteractive, clearGlowTextureCache, clearGradientCache } from './node-renderer.js'
export { IconRegistry, BUILTIN_ICONS } from './icons.js'
export type { RenderNodeOptions, NodeView, NodeVisualState, PinHandle } from './node-renderer.js'

export { renderRerouteNode, rerouteSize, renderRerouteNodeBox, rerouteBoxSize, rerouteStateColor } from './reroute-renderer.js'

export { renderWidgets, computeWidgetRects, resolveWidgetStyle, widgetCssVars, themeCssVars, isDomWidgetController } from './widget-renderer.js'
export type { WidgetRect, WidgetHit, WidgetsView, WidgetLayoutTokens, ResolvedWidgetStyle, CustomWidgetController, CanvasWidgetController, DomWidgetController, CustomWidgetContext } from './widget-renderer.js'

export { renderEdge, drawEdge } from './edge-renderer.js'
export type { RenderEdgeOptions } from './edge-renderer.js'

export {
  screenToWorld,
  worldToScreen,
  zoomAt,
  clampZoom,
  snapToGrid,
  computeDragTarget,
  computeGroupSnappedDelta,
  fitView,
} from './viewport-math.js'
export type { ViewportState, ZoomBounds, Vec2 as ViewportVec2, Rect as ViewportRect, FitViewOptions } from './viewport-math.js'

export { Viewport } from './viewport.js'
export type { ApplyTarget } from './viewport.js'

export { InteractionManager, wheelDeltaToZoomFactor } from './interaction.js'
export type { InteractionManagerOptions } from './interaction.js'

export { createGridSprite } from './grid.js'

export type { XenolithTheme, ThemeRenderContext, PaletteStyle } from './theme.js'
export { xenTheme } from './xen-theme.js'

export { rectFromPoints, rectIntersects, nodeBounds, computeOverlapBackdropPlan } from './geom.js'
export type { Rect as GeomRect, Vec2 as GeomVec2, NodeBoundsTokens } from './geom.js'

export { renderComment } from './comment-renderer.js'
export type { CommentView } from './comment-renderer.js'
export { renderMacroFrame } from './macro-frame.js'
export type { MacroFrameView, MacroFrameState, FrameRect } from './macro-frame.js'

export { shouldVirtualize, visibleWorldRect, reconcileVisibleNodes, useLOD, lodLevel, cellKey, cellsForRect } from './virtualize.js'
export type { Reconciliation, LODLevel, LODThresholds } from './virtualize.js'
