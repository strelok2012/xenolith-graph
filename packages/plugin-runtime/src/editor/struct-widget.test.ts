import { describe, it, expect } from 'vitest'
import {
  structRows, structParseValue, structSetField,
  structAddField, structRemoveField, structRenameField, structChangeType, structFreshKey,
  type StructKind,
} from './struct-widget.js'

describe('structRows', () => {
  it('returns one row per key, in insertion order, classified by value type', () => {
    expect(structRows({ name: 'Ada', priority: 0.5, ready: true, tags: ['x', 'y'] })).toEqual([
      { key: 'name',     value: 'Ada',       kind: 'text'    },
      { key: 'priority', value: 0.5,         kind: 'number'  },
      { key: 'ready',    value: true,        kind: 'boolean' },
      { key: 'tags',     value: ['x', 'y'],  kind: 'array'   },
    ])
  })

  it('returns no rows for non-object input (null, undefined, primitives, arrays)', () => {
    expect(structRows(null)).toEqual([])
    expect(structRows(undefined)).toEqual([])
    expect(structRows(42)).toEqual([])
    expect(structRows('text')).toEqual([])
    expect(structRows([1, 2])).toEqual([])
  })
})

describe('structParseValue', () => {
  it('number: parses via Number(), empty string → 0', () => {
    expect(structParseValue('1.5', 'number')).toBe(1.5)
    expect(structParseValue('', 'number')).toBe(0)
    expect(structParseValue('not a number', 'number')).toBeNaN()
  })

  it('array: comma-split + trim, empty string → []', () => {
    expect(structParseValue('a, b ,c', 'array')).toEqual(['a', 'b', 'c'])
    expect(structParseValue('', 'array')).toEqual([])
  })

  it('text: returns the raw string verbatim', () => {
    expect(structParseValue('Ada', 'text')).toBe('Ada')
  })
})

describe('structSetField', () => {
  it('returns a NEW object with the field set, preserving the others', () => {
    const before = { name: 'Ada', salary: 0.5 }
    const after  = structSetField(before, 'salary', 0.7)
    expect(after).toEqual({ name: 'Ada', salary: 0.7 })
    expect(after).not.toBe(before) // immutable update
  })

  it('adds a new field when the key is not present', () => {
    expect(structSetField({ a: 1 }, 'b', 2)).toEqual({ a: 1, b: 2 })
  })

  it('normalises non-object data to an empty record before setting', () => {
    expect(structSetField(null,      'x', 1)).toEqual({ x: 1 })
    expect(structSetField(undefined, 'x', 1)).toEqual({ x: 1 })
    expect(structSetField([1, 2],    'x', 1)).toEqual({ x: 1 })
  })
})

describe('structAddField', () => {
  it('appends a new key with the default value for the chosen type', () => {
    expect(structAddField({},        'a', 'text'))   .toEqual({ a: ''    })
    expect(structAddField({},        'a', 'number')) .toEqual({ a: 0     })
    expect(structAddField({},        'a', 'boolean')).toEqual({ a: false })
    expect(structAddField({},        'a', 'array'))  .toEqual({ a: []    })
  })
  it('preserves existing fields and append-order', () => {
    expect(Object.keys(structAddField({ a: 1, b: 2 }, 'c', 'text'))).toEqual(['a', 'b', 'c'])
  })
  it('returns a new object (immutable update)', () => {
    const before = { a: 1 }
    const after  = structAddField(before, 'b', 'text')
    expect(after).not.toBe(before)
    expect(before).toEqual({ a: 1 }) // unchanged
  })
})

describe('structRemoveField', () => {
  it('drops the given key, preserves order of the rest', () => {
    expect(structRemoveField({ a: 1, b: 2, c: 3 }, 'b')).toEqual({ a: 1, c: 3 })
    expect(Object.keys(structRemoveField({ a: 1, b: 2, c: 3 }, 'b'))).toEqual(['a', 'c'])
  })
  it('is a no-op if the key is absent', () => {
    expect(structRemoveField({ a: 1 }, 'missing')).toEqual({ a: 1 })
  })
})

describe('structRenameField', () => {
  it('renames in place — same value, same position', () => {
    const out = structRenameField({ a: 1, b: 2, c: 3 }, 'b', 'BETA')
    expect(out).toEqual({ a: 1, BETA: 2, c: 3 })
    expect(Object.keys(out)).toEqual(['a', 'BETA', 'c']) // order kept
  })
  it('is a no-op if old key is absent', () => {
    expect(structRenameField({ a: 1 }, 'missing', 'x')).toEqual({ a: 1 })
  })
  it('refuses to rename onto an existing key (would overwrite)', () => {
    expect(structRenameField({ a: 1, b: 2 }, 'a', 'b')).toEqual({ a: 1, b: 2 }) // unchanged
  })
  it('no-op when newKey === oldKey', () => {
    expect(structRenameField({ a: 1 }, 'a', 'a')).toEqual({ a: 1 })
  })
})

describe('structChangeType', () => {
  const cast = (v: unknown, k: StructKind): unknown => structChangeType({ x: v }, 'x', k)['x']

  it('text → number parses, fallback to 0 on garbage', () => {
    expect(cast('5',   'number')).toBe(5)
    expect(cast('5.5', 'number')).toBe(5.5)
    expect(cast('abc', 'number')).toBe(0)
  })
  it('any → text stringifies', () => {
    expect(cast(5,      'text')).toBe('5')
    expect(cast(true,   'text')).toBe('true')
    expect(cast(['a'],  'text')).toBe('a')
  })
  it('any → boolean truthy-checks', () => {
    expect(cast(0,      'boolean')).toBe(false)
    expect(cast(1,      'boolean')).toBe(true)
    expect(cast('',     'boolean')).toBe(false)
    expect(cast('x',    'boolean')).toBe(true)
  })
  it('string → array via comma-split', () => {
    expect(cast('a, b ,c', 'array')).toEqual(['a', 'b', 'c'])
    expect(cast('',        'array')).toEqual([])
  })
  it('absent key is a no-op', () => {
    expect(structChangeType({ a: 1 }, 'missing', 'text')).toEqual({ a: 1 })
  })
})

describe('structFreshKey', () => {
  it('returns "field1" on empty data', () => {
    expect(structFreshKey({})).toBe('field1')
  })
  it('picks the lowest unused field-N when some are taken', () => {
    expect(structFreshKey({ field1: 1, field3: 1 })).toBe('field2')
    expect(structFreshKey({ field1: 1, field2: 1 })).toBe('field3')
  })
  it('ignores keys that aren’t field-N', () => {
    expect(structFreshKey({ name: '', salary: 0 })).toBe('field1')
  })
})
