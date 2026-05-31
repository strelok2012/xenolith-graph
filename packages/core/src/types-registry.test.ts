import { describe, it, expect, beforeEach } from 'vitest'
import { TypeRegistry, type TypeDescriptor } from './types-registry.js'

const agent: TypeDescriptor = { id: 'struct:Agent', color: '#9b59ff', shape: 'diamond' }
const unit: TypeDescriptor = { id: 'struct:Unit', color: '#3bd6c6', compatibleWith: ['struct:Agent'] }
const scalar: TypeDescriptor = { id: 'scalar', color: '#ffcc00' }

describe('TypeRegistry', () => {
  let reg: TypeRegistry
  beforeEach(() => {
    reg = new TypeRegistry()
    reg.register(agent)
    reg.register(unit)
    reg.register(scalar)
  })

  it('register / get / has / all / size', () => {
    expect(reg.size).toBe(3)
    expect(reg.has('struct:Agent')).toBe(true)
    expect(reg.has('nope')).toBe(false)
    expect(reg.get('scalar')).toEqual(scalar)
    expect(new Set(reg.all().map((d) => d.id))).toEqual(new Set(['struct:Agent', 'struct:Unit', 'scalar']))
  })

  it('register overwrites a descriptor of the same id', () => {
    reg.register({ id: 'scalar', color: '#000000' })
    expect(reg.get('scalar')!.color).toBe('#000000')
    expect(reg.size).toBe(3)
  })

  it('unregister / clear', () => {
    expect(reg.unregister('scalar')).toBe(true)
    expect(reg.unregister('scalar')).toBe(false)
    expect(reg.has('scalar')).toBe(false)
    reg.clear()
    expect(reg.size).toBe(0)
  })

  it('compatible() is exact-match true', () => {
    expect(reg.compatible('scalar', 'scalar')).toBe(true)
  })

  it('compatible() honors compatibleWith symmetrically', () => {
    // Unit declares compatibility with Agent; the check passes regardless of argument order.
    expect(reg.compatible('struct:Unit', 'struct:Agent')).toBe(true)
    expect(reg.compatible('struct:Agent', 'struct:Unit')).toBe(true)
  })

  it('compatible() is false for unrelated registered types', () => {
    expect(reg.compatible('scalar', 'struct:Agent')).toBe(false)
  })

  it('compatible() is false when either side is unregistered (no descriptor, no list)', () => {
    expect(reg.compatible('scalar', 'mystery')).toBe(false)
    expect(reg.compatible('mystery', 'scalar')).toBe(false)
  })

  describe('conversions (G2 — Baklava parity)', () => {
    it('registerConversion + getConversion round-trip; missing pairs return undefined', () => {
      const fn = (v: unknown): string => String(v)
      reg.registerConversion('scalar', 'struct:Agent', fn)
      expect(reg.getConversion('scalar', 'struct:Agent')).toBe(fn)
      expect(reg.getConversion('struct:Agent', 'scalar')).toBeUndefined()        // directional
      expect(reg.getConversion('scalar', 'nope')).toBeUndefined()
    })

    it('conversions are DIRECTIONAL — number→text registered does not imply text→number', () => {
      reg.registerConversion('scalar', 'struct:Agent', (v) => v)
      expect(reg.hasConversion('scalar', 'struct:Agent')).toBe(true)
      expect(reg.hasConversion('struct:Agent', 'scalar')).toBe(false)
    })

    it('compatible() picks up a registered conversion (lifts to "can connect")', () => {
      // Without conversion: not compatible.
      expect(reg.compatible('scalar', 'struct:Agent')).toBe(false)
      // After registering scalar→Agent: compatible direction-aware (compatible() stays symmetric
      // because connection direction is decided by canConnect's IN/OUT, not by the type pair).
      reg.registerConversion('scalar', 'struct:Agent', (v) => v)
      expect(reg.compatible('scalar', 'struct:Agent')).toBe(true)
      expect(reg.compatible('struct:Agent', 'scalar')).toBe(true)
    })

    it('convert() applies the registered fn; returns input unchanged for matching types', () => {
      reg.registerConversion('scalar', 'struct:Agent', (v) => ({ wrapped: v }))
      expect(reg.convert(7, 'scalar', 'struct:Agent')).toEqual({ wrapped: 7 })
      expect(reg.convert(7, 'scalar', 'scalar')).toBe(7)                          // same type → identity
    })

    it('convert() throws on a missing conversion (helps surface bad wiring early)', () => {
      expect(() => reg.convert('x', 'a', 'b')).toThrow(/no conversion/i)
    })

    it('unregisterConversion / clear removes them', () => {
      reg.registerConversion('scalar', 'struct:Agent', (v) => v)
      expect(reg.unregisterConversion('scalar', 'struct:Agent')).toBe(true)
      expect(reg.unregisterConversion('scalar', 'struct:Agent')).toBe(false)
      reg.registerConversion('scalar', 'struct:Agent', (v) => v)
      reg.clear()
      expect(reg.hasConversion('scalar', 'struct:Agent')).toBe(false)
    })
  })
})
