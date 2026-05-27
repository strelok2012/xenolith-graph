// Viewport virtualization (#59): keep a live PIXI view only for nodes near the viewport, so GPU
// memory is O(visible) instead of O(total) — the fix for the ~5000-node crash. These are the PURE
// pieces (no PIXI, fully unit-tested); the editor wires them to its #views map and viewport changes.
//
// Hysteresis is the key to smoothness: a node is CREATED when it reaches the inner (overscan)
// rect, but only DESTROYED when it leaves the larger outer rect. The band between them means a node
// hovering at the edge during a pan is not churned create/destroy every frame — the thing that would
// cause flicker and stutter.

import type { Rect } from './geom.js'
import { rectIntersects } from './geom.js'
import { screenToWorld, type ViewportState } from './viewport-math.js'

/** Virtualization only kicks in past the threshold — at or below it, the graph renders 1:1 (zero
 *  risk for ordinary graphs). */
export function shouldVirtualize(nodeCount: number, threshold: number): boolean {
  return nodeCount > threshold
}

/**
 * Whether to draw nodes in level-of-detail (simplified) form at the current zoom, with hysteresis:
 * enter LOD below `enter`, leave it only above `exit` (exit > enter). The band between the two stops
 * the detail level flip-flopping when the zoom sits right at the threshold during a gesture.
 */
export function useLOD(zoom: number, currentlyLOD: boolean, enter: number, exit: number): boolean {
  if (currentlyLOD) return zoom < exit
  return zoom < enter
}

export type LODLevel = 'full' | 'sprite' | 'flat'

export interface LODThresholds {
  /** flat↔sprite boundary: enter flat below lowEnter, leave flat above lowExit (lowExit > lowEnter). */
  lowEnter: number
  lowExit: number
  /** sprite↔full boundary: enter full above highExit, leave full below highEnter (highExit > highEnter). */
  highEnter: number
  highExit: number
}

/**
 * Three-tier level of detail with independent hysteresis on each boundary:
 *  - close zoom → 'full'   (real nodes)
 *  - mid zoom   → 'sprite' (one baked texture per node TYPE — recognisable, cheap, no LG overlap RTs)
 *  - far zoom   → 'flat'   (single batch of rects)
 * `current` is the level in effect, used to apply hysteresis at whichever boundary the zoom is near.
 */
export function lodLevel(zoom: number, current: LODLevel, t: LODThresholds): LODLevel {
  const flat = current === 'flat' ? zoom < t.lowExit : zoom < t.lowEnter
  if (flat) return 'flat'
  const full = current === 'full' ? zoom > t.highEnter : zoom > t.highExit
  if (full) return 'full'
  return 'sprite'
}

/** World-space AABB of the screen viewport, inflated by `marginPx` screen pixels on every side
 *  (the overscan buffer, expressed in screen px so it stays constant regardless of zoom). */
export function visibleWorldRect(
  screenW: number,
  screenH: number,
  viewport: ViewportState,
  marginPx: number,
): Rect {
  const topLeft = screenToWorld({ x: -marginPx, y: -marginPx }, viewport)
  const bottomRight = screenToWorld({ x: screenW + marginPx, y: screenH + marginPx }, viewport)
  return {
    x: topLeft.x + 0, // normalise -0 → 0
    y: topLeft.y + 0,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  }
}

/** Bucket a world point into a grid cell key at the given cell size. */
export function cellKey(x: number, y: number, cell: number): string {
  return `${Math.floor(x / cell)},${Math.floor(y / cell)}`
}

/** Every grid-cell key a world rect overlaps — used to gather only the nodes near the viewport
 *  instead of scanning the whole graph each frame (the O(N)-per-frame trap on huge graphs). */
export function cellsForRect(rect: Rect, cell: number): string[] {
  const x0 = Math.floor(rect.x / cell)
  const y0 = Math.floor(rect.y / cell)
  const x1 = Math.floor((rect.x + rect.width) / cell)
  const y1 = Math.floor((rect.y + rect.height) / cell)
  const keys: string[] = []
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) keys.push(`${cx},${cy}`)
  return keys
}

export interface Reconciliation {
  /** Non-live nodes that entered the inner rect — create a view for these. */
  show: string[]
  /** Live nodes that left the outer rect — destroy their view (back to data only). */
  hide: string[]
}

/**
 * Decide which node views to create / destroy this pass, with hysteresis.
 *
 * - A node intersecting `inner` and not yet live → show (create).
 * - A live node no longer intersecting `outer` → hide (destroy).
 * - Anything in the band between (live, outside inner but inside outer) is left untouched.
 *
 * `rects` are world-space node AABBs; `live` is the set of node ids that currently have a view.
 */
export function reconcileVisibleNodes(
  rects: ReadonlyArray<{ id: string } & Rect>,
  live: ReadonlySet<string>,
  inner: Rect,
  outer: Rect,
): Reconciliation {
  const show: string[] = []
  const hide: string[] = []
  for (const r of rects) {
    const isLive = live.has(r.id)
    if (!isLive) {
      if (rectIntersects(r, inner)) show.push(r.id)
    } else {
      if (!rectIntersects(r, outer)) hide.push(r.id)
    }
  }
  return { show, hide }
}
