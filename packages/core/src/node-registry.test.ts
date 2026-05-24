import { describe, it, expect, beforeEach } from 'vitest'
import { NodeRegistry, type NodeSchema } from './node-registry.js'
import { isUuidV7 } from './ids.js'

const transform: NodeSchema = {
  type: 'Transform',
  title: 'Transform',
  category: 'logic',
  keywords: ['move', 'translate'],
  pins: [
    { kind: 'exec', direction: 'in',  type: 'exec' },
    { kind: 'data', direction: 'in',  type: 'float', label: 'Amount' },
    { kind: 'data', direction: 'out', type: 'float', label: 'Result', multiple: true },
  ],
}
const source: NodeSchema = {
  type: 'Source', title: 'Source', category: 'io',
  pins: [{ kind: 'data', direction: 'out', type: 'float' }],
}

describe('NodeRegistry', () => {
  let reg: NodeRegistry
  beforeEach(() => {
    reg = new NodeRegistry()
    reg.register(transform)
    reg.register(source)
  })

  it('register / get / has / size', () => {
    expect(reg.size).toBe(2)
    expect(reg.has('Transform')).toBe(true)
    expect(reg.get('Transform')).toEqual(transform)
    expect(reg.get('Nope')).toBeUndefined()
  })

  it('register overwrites an existing type', () => {
    reg.register({ ...transform, title: 'Xform' })
    expect(reg.size).toBe(2)
    expect(reg.get('Transform')?.title).toBe('Xform')
  })

  it('unregister removes a schema', () => {
    expect(reg.unregister('Source')).toBe(true)
    expect(reg.has('Source')).toBe(false)
    expect(reg.unregister('Source')).toBe(false)
  })

  it('clear removes every schema', () => {
    reg.clear()
    expect(reg.size).toBe(0)
    expect(reg.all()).toEqual([])
  })

  it('all() returns every registered schema', () => {
    expect(reg.all().map((s) => s.type).sort()).toEqual(['Source', 'Transform'])
  })

  describe('instantiate', () => {
    it('builds a Node with fresh ids at the given position', () => {
      const node = reg.instantiate('Transform', { x: 100, y: 200 })
      expect(node.type).toBe('Transform')
      expect(node.position).toEqual({ x: 100, y: 200 })
      expect(isUuidV7(node.id)).toBe(true)
      expect(node.pins).toHaveLength(3)
      expect(node.pins[0]).toMatchObject({ kind: 'exec', direction: 'in', type: 'exec', multiple: false })
      expect(node.pins[2]).toMatchObject({ direction: 'out', label: 'Result', multiple: true })
      node.pins.forEach((p) => expect(isUuidV7(p.id)).toBe(true))
      expect(node.state).toEqual({})
    })

    it('throws on unknown type', () => {
      expect(() => reg.instantiate('Nope', { x: 0, y: 0 })).toThrow(/Nope/)
    })

    it('produces unique ids on each call', () => {
      const a = reg.instantiate('Source', { x: 0, y: 0 })
      const b = reg.instantiate('Source', { x: 0, y: 0 })
      expect(a.id).not.toBe(b.id)
      expect(a.pins[0]!.id).not.toBe(b.pins[0]!.id)
    })
  })

  describe('search', () => {
    it('empty query returns all schemas', () => {
      expect(reg.search('').length).toBe(2)
    })

    it('fuzzy-matches the title', () => {
      const r = reg.search('tra')
      expect(r[0]?.schema.type).toBe('Transform')
      expect(r[0]?.indices).toEqual([0, 1, 2])
    })

    it('matches via keywords', () => {
      const r = reg.search('move')
      expect(r.map((x) => x.schema.type)).toContain('Transform')
    })

    it('matches via category', () => {
      const r = reg.search('io')
      expect(r.map((x) => x.schema.type)).toContain('Source')
    })

    it('returns nothing for a non-match', () => {
      expect(reg.search('zzzzz')).toEqual([])
    })

    it('sorts by descending score', () => {
      reg.register({ type: 'Translate', title: 'Translate', pins: [] })
      const r = reg.search('tra')
      const scores = r.map((x) => x.score)
      expect(scores).toEqual([...scores].sort((a, b) => b - a))
    })
  })
})
