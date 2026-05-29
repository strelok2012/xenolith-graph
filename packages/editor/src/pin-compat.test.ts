import { describe, it, expect } from 'vitest'
import { TypeRegistry, type Pin } from '@xenolith/core'
import { canConnect } from './pin-compat.js'

const pin = (over: Partial<Pin> & Pick<Pin, 'id' | 'direction'>): Pin => ({
  kind: 'data',
  type: 'float',
  multiple: false,
  ...over,
})

describe('canConnect', () => {
  it('rejects same-direction pairs (out → out, in → in)', () => {
    expect(canConnect(pin({ id: 'a' as any, direction: 'out' }), pin({ id: 'b' as any, direction: 'out' }), false)).toBe(false)
    expect(canConnect(pin({ id: 'a' as any, direction: 'in'  }), pin({ id: 'b' as any, direction: 'in'  }), false)).toBe(false)
  })

  it('rejects connecting a node to itself', () => {
    expect(canConnect(pin({ id: 'a' as any, direction: 'out' }), pin({ id: 'b' as any, direction: 'in'  }), true)).toBe(false)
  })

  it('rejects mixing exec and data pins', () => {
    expect(canConnect(
      pin({ id: 'a' as any, direction: 'out', kind: 'exec' }),
      pin({ id: 'b' as any, direction: 'in',  kind: 'data' }),
      false,
    )).toBe(false)
  })

  it('rejects mismatched data types', () => {
    expect(canConnect(
      pin({ id: 'a' as any, direction: 'out', type: 'float'  }),
      pin({ id: 'b' as any, direction: 'in',  type: 'string' }),
      false,
    )).toBe(false)
  })

  it('accepts opposite-direction same-type data pins on different nodes', () => {
    expect(canConnect(
      pin({ id: 'a' as any, direction: 'out', type: 'float' }),
      pin({ id: 'b' as any, direction: 'in',  type: 'float' }),
      false,
    )).toBe(true)
  })

  it('accepts exec → exec across nodes regardless of type field', () => {
    expect(canConnect(
      pin({ id: 'a' as any, direction: 'out', kind: 'exec', type: 'exec' }),
      pin({ id: 'b' as any, direction: 'in',  kind: 'exec', type: 'exec' }),
      false,
    )).toBe(true)
  })

  it('accepts when either side has type "any"', () => {
    expect(canConnect(
      pin({ id: 'a' as any, direction: 'out', type: 'any'    }),
      pin({ id: 'b' as any, direction: 'in',  type: 'string' }),
      false,
    )).toBe(true)
    expect(canConnect(
      pin({ id: 'a' as any, direction: 'out', type: 'float'  }),
      pin({ id: 'b' as any, direction: 'in',  type: 'any'    }),
      false,
    )).toBe(true)
  })

  it('orientation-agnostic: swapping the arguments yields the same result', () => {
    const out = pin({ id: 'a' as any, direction: 'out', type: 'float' })
    const inn = pin({ id: 'b' as any, direction: 'in',  type: 'float' })
    expect(canConnect(out, inn, false)).toBe(canConnect(inn, out, false))
  })

  describe('compatibleWith via a TypeRegistry', () => {
    const types = new TypeRegistry()
    types.register({ id: 'struct:Agent', color: '#9b59ff' })
    types.register({ id: 'struct:Unit', color: '#3bd6c6', compatibleWith: ['struct:Agent'] })

    it('rejects mismatched custom types without a registry', () => {
      expect(canConnect(
        pin({ id: 'a' as any, direction: 'out', type: 'struct:Unit'  }),
        pin({ id: 'b' as any, direction: 'in',  type: 'struct:Agent' }),
        false,
      )).toBe(false)
    })

    it('accepts when the registry says the two custom types are compatible (symmetric)', () => {
      const unit  = pin({ id: 'a' as any, direction: 'out', type: 'struct:Unit'  })
      const agent = pin({ id: 'b' as any, direction: 'in',  type: 'struct:Agent' })
      expect(canConnect(unit, agent, false, { types })).toBe(true)
      expect(canConnect(agent, unit, false, { types })).toBe(true)
    })

    it('still rejects unrelated custom types even with a registry', () => {
      expect(canConnect(
        pin({ id: 'a' as any, direction: 'out', type: 'struct:Agent' }),
        pin({ id: 'b' as any, direction: 'in',  type: 'scalar'       }),
        false,
        { types },
      )).toBe(false)
    })

    it('exact-type match still wins regardless of the registry', () => {
      expect(canConnect(
        pin({ id: 'a' as any, direction: 'out', type: 'struct:Agent' }),
        pin({ id: 'b' as any, direction: 'in',  type: 'struct:Agent' }),
        false,
        { types },
      )).toBe(true)
    })
  })

  describe('capacity enforcement (multiple flag)', () => {
    const out = pin({ id: 'o' as any, direction: 'out', type: 'float', multiple: true  })
    const inn = pin({ id: 'i' as any, direction: 'in',  type: 'float', multiple: false })

    it('rejects a connection to a single-edge input that already has one edge', () => {
      expect(canConnect(out, inn, false, { targetEdges: 1 })).toBe(false)
    })

    it('accepts when the single-edge input is still empty', () => {
      expect(canConnect(out, inn, false, { targetEdges: 0 })).toBe(true)
    })

    it('allows multiple edges into a multiple:true input', () => {
      const multiIn = pin({ id: 'mi' as any, direction: 'in', type: 'float', multiple: true })
      expect(canConnect(out, multiIn, false, { targetEdges: 5 })).toBe(true)
    })

    it('rejects a connection from a single-edge output that already has one edge', () => {
      const singleOut = pin({ id: 'so' as any, direction: 'out', type: 'float', multiple: false })
      const multiIn   = pin({ id: 'mi' as any, direction: 'in',  type: 'float', multiple: true  })
      expect(canConnect(singleOut, multiIn, false, { sourceEdges: 1 })).toBe(false)
    })

    it('capacity check is orientation-agnostic — swap arguments + swap counts yields the same', () => {
      const a = pin({ id: 'a' as any, direction: 'out', type: 'float', multiple: false })
      const b = pin({ id: 'b' as any, direction: 'in',  type: 'float', multiple: true  })
      expect(canConnect(a, b, false, { sourceEdges: 1, targetEdges: 0 })).toBe(false)
      expect(canConnect(b, a, false, { sourceEdges: 0, targetEdges: 1 })).toBe(false)
    })
  })
})
