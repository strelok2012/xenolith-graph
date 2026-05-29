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
})
