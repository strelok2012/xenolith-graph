import { describe, it, expect } from 'vitest'
import { createNodeId, createPinId, type Node, type Pin, type WidgetSpec } from '@xenolith/core'
import { computeWidgetRects, type WidgetLayoutTokens } from './widget-renderer.js'

const GEO: WidgetLayoutTokens = {
  node:   { headerHeight: 21 },
  pin:    { rowSpacing: 10, rowHeight: 11 },
  header: { toPinsGap: 15 },
  widget: { rowHeight: 22, gap: 6, paddingX: 8 },
}

const pin = (direction: 'in' | 'out'): Pin =>
  ({ id: createPinId(), kind: 'data', direction, type: 'float', multiple: false })

function node(widgets: WidgetSpec[], pins: Pin[] = [pin('in'), pin('out')]): Node {
  return { id: createNodeId(), type: 'T', position: { x: 0, y: 0 }, state: {}, pins, widgets }
}

describe('computeWidgetRects', () => {
  it('stacks widget rows below the pin block, inset by paddingX', () => {
    const n = node([
      { id: 'a', type: 'number', label: 'A', key: 'a' },
      { id: 'b', type: 'toggle', label: 'B', key: 'b' },
    ])
    const rects = computeWidgetRects(n, 200, GEO)
    // 1 pin row → pinRowsHeight = 11; yStart = 21 + 15 + 11 + gap(6) = 53
    expect(rects[0]).toEqual({ id: 'a', x: 8, y: 53, width: 184, height: 22 })
    expect(rects[1]).toEqual({ id: 'b', x: 8, y: 53 + 22 + 6, width: 184, height: 22 })
  })

  it('gives a multiline text widget three field rows (+ a label row when labelled)', () => {
    const rects = computeWidgetRects(node([{ id: 't', type: 'text', label: 'T', key: 't', multiline: true }]), 200, GEO)
    expect(rects[0]!.height).toBe(66 + 22) // 3 field rows + 1 label row
  })

  it('returns [] when the node has no widgets', () => {
    expect(computeWidgetRects(node([]), 200, GEO)).toEqual([])
    const bare: Node = { id: createNodeId(), type: 'T', position: { x: 0, y: 0 }, state: {}, pins: [] }
    expect(computeWidgetRects(bare, 200, GEO)).toEqual([])
  })
})
