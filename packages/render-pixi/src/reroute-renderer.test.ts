import { describe, it, expect } from 'vitest'
import { createReroute } from '@xenolith/core'
import { renderRerouteNode, rerouteSize } from './reroute-renderer.js'
import { readPinHandle } from './node-renderer.js'
import { xenTokens } from '@xenolith/theme-xen'
import type { Container } from 'pixi.js'

function anyPinHandle(container: Container): boolean {
  for (const child of container.children) {
    if (readPinHandle(child)) return true
    if ((child as Container).children?.length && anyPinHandle(child as Container)) return true
  }
  return false
}

const R = xenTokens.geometry.reroute.radius

describe('renderRerouteNode', () => {
  it('rerouteSize is a square spanning the dot diameter', () => {
    expect(rerouteSize(xenTokens)).toEqual({ x: 2 * R, y: 2 * R })
  })

  it('places the in pin on the left edge and the out pin on the right edge, vertically centred', () => {
    const n = createReroute({ x: 100, y: 50 })
    const view = renderRerouteNode(n, xenTokens, {})
    const inLocal = view.pinLocalPosition(String(n.pins[0]!.id))
    const outLocal = view.pinLocalPosition(String(n.pins[1]!.id))
    expect(inLocal).toEqual({ x: 0, y: R })
    expect(outLocal).toEqual({ x: 2 * R, y: R })
  })

  it('exposes no interactive pin handles — an inline reroute cannot be pulled from', () => {
    const n = createReroute({ x: 0, y: 0 })
    const view = renderRerouteNode(n, xenTokens, {})
    expect(anyPinHandle(view.container)).toBe(false)
  })

  it('reports a non-collapsible view and ignores setCollapsed', () => {
    const n = createReroute({ x: 0, y: 0 })
    const view = renderRerouteNode(n, xenTokens, {})
    expect(view.isCollapsed()).toBe(false)
    view.setCollapsed(true)
    expect(view.isCollapsed()).toBe(false)
  })

  it('positions the container at the node position', () => {
    const n = createReroute({ x: 100, y: 50 })
    const view = renderRerouteNode(n, xenTokens, {})
    expect(view.container.position.x).toBe(100)
    expect(view.container.position.y).toBe(50)
  })
})

import { renderRerouteNodeBox, rerouteBoxSize } from './reroute-renderer.js'

describe('renderRerouteNodeBox (palette reroute node)', () => {
  it('is a compact box with in on the left edge and out on the right edge', () => {
    const n = createReroute({ x: 0, y: 0 }) // 1 in + 1 out, type any
    const { x: w, y: h } = rerouteBoxSize(xenTokens)
    const view = renderRerouteNodeBox(n, xenTokens, {})
    expect(view.pinLocalPosition(String(n.pins[0]!.id))).toEqual({ x: 0, y: h / 2 })
    expect(view.pinLocalPosition(String(n.pins[1]!.id))).toEqual({ x: w, y: h / 2 })
  })

  it('exposes interactive (pullable) pin handles — unlike the inline dot', () => {
    const n = createReroute({ x: 0, y: 0 })
    const view = renderRerouteNodeBox(n, xenTokens, {})
    expect(anyPinHandle(view.container)).toBe(true)
  })
})
