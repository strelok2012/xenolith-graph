import { describe, it, expect } from 'vitest'
import { visibleWorldRect, reconcileVisibleNodes, shouldVirtualize, useLOD, lodLevel, cellKey, cellsForRect } from './virtualize.js'
import type { Rect } from './geom.js'

describe('spatial grid', () => {
  it('cellKey buckets a point by cell size', () => {
    expect(cellKey(0, 0, 1000)).toBe('0,0')
    expect(cellKey(1500, 2500, 1000)).toBe('1,2')
    expect(cellKey(-100, -100, 1000)).toBe('-1,-1')
  })

  it('cellsForRect lists every cell a rect touches', () => {
    // rect 0,0 → 1500×1500 with cell 1000 spans cells (0,0),(1,0),(0,1),(1,1)
    const cells = cellsForRect({ x: 0, y: 0, width: 1500, height: 1500 }, 1000).sort()
    expect(cells).toEqual(['0,0', '0,1', '1,0', '1,1'])
  })

  it('cellsForRect is a single cell for a small rect inside one', () => {
    expect(cellsForRect({ x: 100, y: 100, width: 50, height: 50 }, 1000)).toEqual(['0,0'])
  })
})

describe('lodLevel (three-tier zoom with hysteresis)', () => {
  // full (close) → sprite (mid) → flat (far). Two boundaries, each with an enter/exit gap.
  const t = { lowEnter: 0.18, lowExit: 0.24, highEnter: 0.45, highExit: 0.55 }

  it('is full when zoomed in', () => {
    expect(lodLevel(1, 'full', t)).toBe('full')
    expect(lodLevel(0.7, 'sprite', t)).toBe('full') // past highExit
  })
  it('is sprite at mid zoom', () => {
    expect(lodLevel(0.35, 'full', t)).toBe('sprite') // dropped below highEnter
    expect(lodLevel(0.35, 'flat', t)).toBe('sprite') // rose above lowExit
  })
  it('is flat when zoomed far out', () => {
    expect(lodLevel(0.1, 'sprite', t)).toBe('flat')
  })
  it('holds full across the upper band (hysteresis)', () => {
    // in full, zoom dips into band (between highEnter and highExit) → stay full
    expect(lodLevel(0.5, 'full', t)).toBe('full')
    // coming from sprite, same zoom → stay sprite (don't jump to full until highExit)
    expect(lodLevel(0.5, 'sprite', t)).toBe('sprite')
  })
  it('holds flat across the lower band (hysteresis)', () => {
    // in flat, zoom rises into band (between lowEnter and lowExit) → stay flat
    expect(lodLevel(0.2, 'flat', t)).toBe('flat')
    // coming from sprite, same zoom → stay sprite (don't drop to flat until lowEnter)
    expect(lodLevel(0.2, 'sprite', t)).toBe('sprite')
  })
})

describe('useLOD (zoom hysteresis)', () => {
  // enter LOD below `enter`, leave it above `exit` (exit > enter) — the band stops flip-flopping
  // when the zoom hovers right at the threshold.
  const enter = 0.35
  const exit = 0.5

  it('enters LOD when zoomed far out and not already in LOD', () => {
    expect(useLOD(0.2, false, enter, exit)).toBe(true)
  })
  it('stays full detail when zoomed in', () => {
    expect(useLOD(1, false, enter, exit)).toBe(false)
  })
  it('does not leave LOD until zoom passes the higher exit threshold', () => {
    // in LOD, zoom rises into the band (between enter and exit) → stay in LOD
    expect(useLOD(0.42, true, enter, exit)).toBe(true)
    // past exit → leave LOD
    expect(useLOD(0.55, true, enter, exit)).toBe(false)
  })
  it('does not enter LOD while in the band coming from full detail', () => {
    // full detail, zoom drops into the band but not below enter → stay full detail
    expect(useLOD(0.42, false, enter, exit)).toBe(false)
  })
})

describe('shouldVirtualize', () => {
  it('is off at or below the threshold, on above it', () => {
    expect(shouldVirtualize(300, 300)).toBe(false)
    expect(shouldVirtualize(299, 300)).toBe(false)
    expect(shouldVirtualize(301, 300)).toBe(true)
  })
})

describe('visibleWorldRect', () => {
  it('maps the screen viewport to world space at zoom 1, no margin', () => {
    // viewport origin at (0,0), zoom 1 → screen == world
    const r = visibleWorldRect(800, 600, { x: 0, y: 0, zoom: 1 }, 0)
    expect(r).toEqual({ x: 0, y: 0, width: 800, height: 600 })
  })

  it('accounts for pan: world origin shifted by viewport x/y', () => {
    // world point under screen (0,0) is (-x/zoom) = (-100,-50)
    const r = visibleWorldRect(800, 600, { x: 100, y: 50, zoom: 1 }, 0)
    expect(r).toEqual({ x: -100, y: -50, width: 800, height: 600 })
  })

  it('accounts for zoom: a zoomed-in viewport covers less world area', () => {
    const r = visibleWorldRect(800, 600, { x: 0, y: 0, zoom: 2 }, 0)
    expect(r).toEqual({ x: 0, y: 0, width: 400, height: 300 })
  })

  it('inflates by margin given in SCREEN pixels (converted to world units)', () => {
    // 100px margin at zoom 2 → 50 world units each side
    const r = visibleWorldRect(800, 600, { x: 0, y: 0, zoom: 2 }, 100)
    expect(r).toEqual({ x: -50, y: -50, width: 500, height: 400 })
  })
})

describe('reconcileVisibleNodes (hysteresis)', () => {
  const rect = (id: string, x: number, y: number): { id: string } & Rect => ({ id, x, y, width: 100, height: 60 })
  const inner: Rect = { x: 0, y: 0, width: 800, height: 600 }
  const outer: Rect = { x: -200, y: -200, width: 1200, height: 1000 }

  it('shows a non-live node that enters the inner rect', () => {
    const rects = [rect('a', 100, 100)]
    const { show, hide } = reconcileVisibleNodes(rects, new Set(), inner, outer)
    expect(show).toEqual(['a'])
    expect(hide).toEqual([])
  })

  it('does not re-show an already-live node', () => {
    const rects = [rect('a', 100, 100)]
    const { show, hide } = reconcileVisibleNodes(rects, new Set(['a']), inner, outer)
    expect(show).toEqual([])
    expect(hide).toEqual([])
  })

  it('keeps a live node alive while it sits in the hysteresis band (outside inner, inside outer)', () => {
    // x=850 is past inner (ends at 800) but within outer (ends at 1000)
    const rects = [rect('a', 850, 100)]
    const { show, hide } = reconcileVisibleNodes(rects, new Set(['a']), inner, outer)
    expect(show).toEqual([])
    expect(hide).toEqual([]) // hysteresis: not killed yet
  })

  it('does NOT show a non-live node sitting only in the hysteresis band', () => {
    const rects = [rect('a', 850, 100)]
    const { show, hide } = reconcileVisibleNodes(rects, new Set(), inner, outer)
    expect(show).toEqual([]) // must reach inner to be created
    expect(hide).toEqual([])
  })

  it('hides a live node that leaves the outer rect entirely', () => {
    const rects = [rect('a', 5000, 5000)]
    const { show, hide } = reconcileVisibleNodes(rects, new Set(['a']), inner, outer)
    expect(show).toEqual([])
    expect(hide).toEqual(['a'])
  })
})
