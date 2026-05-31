import { describe, it, expect, beforeEach } from 'vitest'
import { NodeRegistry, migrateNodePayload, type NodeSchema } from './node-registry.js'
import type { Node } from './graph.js'
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

    it('copies schema widgets onto the node and seeds default values into state', () => {
      reg.register({
        type: 'Knob', title: 'Knob', pins: [],
        widgets: [
          { id: 'amt', type: 'slider', label: 'Amount', key: 'amount', min: 0, max: 10 },
          { id: 'mode', type: 'combo', label: 'Mode', key: 'mode', values: ['add', 'mul'] },
          { id: 'go', type: 'button', label: 'Run', action: 'run' },
        ],
      })
      const node = reg.instantiate('Knob', { x: 0, y: 0 })
      expect(node.widgets).toHaveLength(3)
      // value-bearing widgets seed their default into state; button (no key) seeds nothing.
      expect(node.state).toEqual({ amount: 0, mode: 'add' })
    })

    it('produces unique ids on each call', () => {
      const a = reg.instantiate('Source', { x: 0, y: 0 })
      const b = reg.instantiate('Source', { x: 0, y: 0 })
      expect(a.id).not.toBe(b.id)
      expect(a.pins[0]!.id).not.toBe(b.pins[0]!.id)
    })

    it('copies the schema pure flag and meta onto the node', () => {
      reg.register({ type: 'Add', title: 'Add', pure: true, meta: { evalKind: 'pure', nativeImpl: 'add' }, pins: [] })
      const node = reg.instantiate('Add', { x: 0, y: 0 })
      expect(node.pure).toBe(true)
      expect(node.meta).toEqual({ evalKind: 'pure', nativeImpl: 'add' })
    })

    it('leaves pure/meta undefined when the schema omits them', () => {
      const node = reg.instantiate('Source', { x: 0, y: 0 })
      expect(node.pure).toBeUndefined()
      expect(node.meta).toBeUndefined()
    })

    it('copies the schema header glyph onto the node', () => {
      reg.register({ type: 'Cpu', title: 'Cpu', glyph: { icon: 'cpu', side: 'right' }, pins: [] })
      const node = reg.instantiate('Cpu', { x: 0, y: 0 })
      expect(node.glyph).toEqual({ icon: 'cpu', side: 'right' })
      // a fresh copy, not the schema's object
      expect(node.glyph).not.toBe(reg.get('Cpu')!.glyph)
    })

    it('leaves glyph undefined when the schema omits it', () => {
      expect(reg.instantiate('Source', { x: 0, y: 0 }).glyph).toBeUndefined()
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

describe('migrateNodePayload (A4 — NodeSchema.migrate)', () => {
  const v2: NodeSchema = {
    type: 'HTTPRequest', title: 'HTTP', pins: [],
    version: 2,
    // v1 stored url segments as an array; v2 joins them into a single string.
    migrate: (old, fromVersion) => {
      if (fromVersion === 1) {
        const segs = (old.state?.['urlSegments'] ?? []) as string[]
        const { urlSegments, ...rest } = old.state ?? {}
        return { state: { ...rest, url: segs.join('/') } }
      }
      return {}
    },
  }

  it('runs migrate when payload version is below schema version', () => {
    const oldPayload: Partial<Node> = { type: 'HTTPRequest', version: 1, state: { urlSegments: ['api', 'v1', 'users'] } }
    const { node, version } = migrateNodePayload(v2, oldPayload)
    expect(version).toBe(2)
    expect(node.version).toBe(2)
    expect(node.state).toEqual({ url: 'api/v1/users' })
  })

  it('is a no-op when payload version equals current schema version', () => {
    const cur: Partial<Node> = { type: 'HTTPRequest', version: 2, state: { url: 'already-migrated' } }
    const { node } = migrateNodePayload(v2, cur)
    expect(node.state).toEqual({ url: 'already-migrated' })
  })

  it('is a no-op when schema has no migrate (assumes shape unchanged across versions)', () => {
    const noMigrate: NodeSchema = { type: 'X', title: 'X', pins: [], version: 5 }
    const old: Partial<Node> = { type: 'X', version: 1, state: { foo: 'bar' } }
    const { node, version } = migrateNodePayload(noMigrate, old)
    expect(version).toBe(5)
    expect(node.state).toEqual({ foo: 'bar' }) // untouched
  })

  it('treats missing payload.version as 1 (pre-versioning era)', () => {
    const oldPayload: Partial<Node> = { type: 'HTTPRequest', state: { urlSegments: ['a', 'b'] } }
    const { node } = migrateNodePayload(v2, oldPayload)
    expect(node.state).toEqual({ url: 'a/b' })
  })

  it('an unknown schema (no entry) returns the payload as-is, version 1', () => {
    const old: Partial<Node> = { type: 'Mystery', state: { x: 1 } }
    const { node, version } = migrateNodePayload(undefined, old)
    expect(version).toBe(1)
    expect(node).toBe(old) // identity
  })

  it('instantiate stamps the schema version onto the new node', () => {
    const reg = new NodeRegistry()
    reg.register({ type: 'Versioned', title: 'V', pins: [], version: 3 })
    const node = reg.instantiate('Versioned', { x: 0, y: 0 })
    expect(node.version).toBe(3)
  })
})
