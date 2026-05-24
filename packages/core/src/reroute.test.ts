import { describe, it, expect } from 'vitest'
import { REROUTE_TYPE, isReroute, createReroute } from './reroute.js'
import { isUuidV7 } from './ids.js'

describe('reroute', () => {
  it('isReroute recognises the reserved type only', () => {
    expect(isReroute({ type: REROUTE_TYPE })).toBe(true)
    expect(isReroute({ type: 'KSampler' })).toBe(false)
  })

  it('createReroute mints a passthrough node with one in and one out pin', () => {
    const n = createReroute({ x: 10, y: 20 })
    expect(n.type).toBe(REROUTE_TYPE)
    expect(n.position).toEqual({ x: 10, y: 20 })
    expect(isUuidV7(n.id)).toBe(true)
    expect(n.pins).toHaveLength(2)
    const [inp, out] = n.pins
    expect(inp).toMatchObject({ kind: 'data', direction: 'in', multiple: false })
    expect(out).toMatchObject({ kind: 'data', direction: 'out', multiple: true })
    expect(isUuidV7(inp!.id)).toBe(true)
    expect(isUuidV7(out!.id)).toBe(true)
    expect(inp!.id).not.toBe(out!.id)
  })

  it('defaults both pins to the "any" type, overridable for wire colouring', () => {
    expect(createReroute({ x: 0, y: 0 }).pins.every((p) => p.type === 'any')).toBe(true)
    const typed = createReroute({ x: 0, y: 0 }, { type: 'object' })
    expect(typed.pins.every((p) => p.type === 'object')).toBe(true)
  })

  it('produces unique ids on each call', () => {
    const a = createReroute({ x: 0, y: 0 })
    const b = createReroute({ x: 0, y: 0 })
    expect(a.id).not.toBe(b.id)
    expect(a.pins[0]!.id).not.toBe(b.pins[0]!.id)
  })
})

import { REROUTE_NODE_TYPE, rerouteNodeSchema } from './reroute.js'

describe('rerouteNodeSchema (palette reroute node)', () => {
  it('is a normal rectangular node type, distinct from the inline dot', () => {
    expect(REROUTE_NODE_TYPE).toBe('Reroute')
    expect(REROUTE_NODE_TYPE).not.toBe(REROUTE_TYPE)
  })

  it('has one passthrough input and one fan-out output', () => {
    expect(rerouteNodeSchema.type).toBe(REROUTE_NODE_TYPE)
    const ins = rerouteNodeSchema.pins.filter((p) => p.direction === 'in')
    const outs = rerouteNodeSchema.pins.filter((p) => p.direction === 'out')
    expect(ins).toHaveLength(1)
    expect(outs).toHaveLength(1)
    expect(outs[0]!.multiple).toBe(true)
  })

  it('is findable by the word "reroute"', () => {
    expect((rerouteNodeSchema.keywords ?? []).concat(rerouteNodeSchema.title.toLowerCase()))
      .toContain('reroute')
  })
})
