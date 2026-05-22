export interface Vec2 {
  x: number
  y: number
}

export interface ViewportState {
  /** World origin x-position in screen coordinates. */
  x: number
  /** World origin y-position in screen coordinates. */
  y: number
  /** Scale factor: 1 = 1:1, 2 = zoomed in 2× (each world unit takes 2 screen pixels). */
  zoom: number
}

export type ZoomBounds = readonly [min: number, max: number]

const DEFAULT_BOUNDS: ZoomBounds = [0.05, 16]

export function screenToWorld(screen: Vec2, v: ViewportState): Vec2 {
  return {
    x: (screen.x - v.x) / v.zoom,
    y: (screen.y - v.y) / v.zoom,
  }
}

export function worldToScreen(world: Vec2, v: ViewportState): Vec2 {
  return {
    x: world.x * v.zoom + v.x,
    y: world.y * v.zoom + v.y,
  }
}

export function clampZoom(zoom: number, min: number, max: number): number {
  if (zoom < min) return min
  if (zoom > max) return max
  return zoom
}

/**
 * Focal zoom: scale by `factor` while keeping the world point currently under `focalScreen`
 * anchored to that same screen point. The classic UE / Figma / VSCode-canvas zoom feel.
 *
 *   world_after = (screen - x') / zoom'
 *   require: world_after === world_before for screen === focalScreen
 *   solving: x' = focalScreen - world_before * zoom'
 */
export function zoomAt(
  v: ViewportState,
  focalScreen: Vec2,
  factor: number,
  bounds: ZoomBounds = DEFAULT_BOUNDS,
): ViewportState {
  const targetZoom = clampZoom(v.zoom * factor, bounds[0], bounds[1])
  const worldFocal = screenToWorld(focalScreen, v)
  return {
    zoom: targetZoom,
    x: focalScreen.x - worldFocal.x * targetZoom,
    y: focalScreen.y - worldFocal.y * targetZoom,
  }
}

/**
 * Snap a point to the nearest multiple of `cellSize` on each axis. Used by drag to give the
 * UE-style "feels continuous but actually quantised" feel. `cellSize === 1` rounds to integer
 * pixels; pass `Number.EPSILON` (or skip the call) for true continuous motion.
 */
/** Round-half-away-from-zero so snap is symmetric: 2.5 → 3, −2.5 → −3 (JS Math.round goes 2.5 → 3
 *  but −2.5 → −2, which makes drag feel jerky around the origin). */
function roundAwayFromZero(n: number): number {
  return n >= 0 ? Math.round(n) : -Math.round(-n)
}

export function snapToGrid(point: Vec2, cellSize: number): Vec2 {
  if (!(cellSize > 0)) {
    throw new Error(`snapToGrid: cellSize must be > 0, got ${cellSize}`)
  }
  const sx = roundAwayFromZero(point.x / cellSize) * cellSize
  const sy = roundAwayFromZero(point.y / cellSize) * cellSize
  // Normalise -0 to +0 so callers don't trip on Object.is(-0, 0) === false.
  return { x: sx === 0 ? 0 : sx, y: sy === 0 ? 0 : sy }
}

/**
 * Resolve a node's final position during/at the end of a drag gesture.
 *
 * @param initial  position when the drag started
 * @param delta    world-space delta accumulated since the start
 * @param snap     grid cell size, or null to disable snap (used while Alt is held)
 */
export function computeDragTarget(initial: Vec2, delta: Vec2, snap: number | null): Vec2 {
  const raw = { x: initial.x + delta.x, y: initial.y + delta.y }
  return snap === null ? raw : snapToGrid(raw, snap)
}
