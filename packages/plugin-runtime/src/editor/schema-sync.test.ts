import { describe, it, expect } from 'vitest'
import { pinsFromSchemaFields, schemaPinTypeFor, widgetsFromSchemaFields, type SchemaExtraPin } from './schema-sync.js'
import type { Pin, PinId } from '@xenolith/core'

const pid = (s: string): PinId => s as unknown as PinId
const schemaPin: Pin = { id: pid('p:schema'), kind: 'data', direction: 'in', type: 'object', multiple: false, label: 'schema' }
const selfPin:   Pin = { id: pid('p:self'),   kind: 'data', direction: 'out', type: 'object', multiple: true,  label: 'self' }

describe('schemaPinTypeFor', () => {
  it('infers the pin type from the default value', () => {
    expect(schemaPinTypeFor('text')).toBe('string')
    expect(schemaPinTypeFor(42)).toBe('scalar')
    expect(schemaPinTypeFor(true)).toBe('bool')
    expect(schemaPinTypeFor([1, 2])).toBe('array')
    expect(schemaPinTypeFor({ a: 1 })).toBe('object')
    expect(schemaPinTypeFor(null)).toBe('any')
    expect(schemaPinTypeFor(undefined)).toBe('any')
  })
})

describe('pinsFromSchemaFields', () => {
  it('keeps base pins (schema + self) and appends one in-pin per field, in declared order', () => {
    const out = pinsFromSchemaFields([schemaPin, selfPin], { name: 'Ada', priority: 0, salary: 0.5 })
    expect(out.map((p) => p.id)).toEqual(['p:schema', 'p:self', 'field:name', 'field:priority', 'field:salary'])
  })

  it('synthesized pin: id `field:<key>`, label = key, data-in, type inferred', () => {
    const out = pinsFromSchemaFields([schemaPin, selfPin], { salary: 0.5 })
    const sp = out.find((p) => p.id === 'field:salary')!
    expect(sp).toEqual({ id: 'field:salary', kind: 'data', direction: 'in', type: 'scalar', multiple: false, label: 'salary' })
  })

  it('preserves any base pins beyond schema/self (e.g. a multi `subscribe` pin)', () => {
    const subscribe: Pin = { id: pid('p:subscribe'), kind: 'data', direction: 'in', type: 'goodie-rec', multiple: true, label: 'subscribe' }
    const out = pinsFromSchemaFields([schemaPin, selfPin, subscribe], { name: 'Ada' })
    expect(out.map((p) => p.id)).toEqual(['p:schema', 'p:self', 'p:subscribe', 'field:name'])
  })

  it('replaces stale field pins on re-sync (idempotent for the same schema; clean for a new one)', () => {
    const first  = pinsFromSchemaFields([schemaPin, selfPin], { name: 'Ada',     salary: 0.5 })
    const second = pinsFromSchemaFields(first,                { name: 'Ada', priority: 0   }) // salary removed, priority added
    expect(second.map((p) => p.id)).toEqual(['p:schema', 'p:self', 'field:name', 'field:priority'])
    // The OLD field:salary pin is gone (no leftover field:* from a prior schema).
  })

  it('an empty schema strips all field pins, keeps the base', () => {
    const before = pinsFromSchemaFields([schemaPin, selfPin], { name: 'Ada' })
    const after  = pinsFromSchemaFields(before, {})
    expect(after.map((p) => p.id)).toEqual(['p:schema', 'p:self'])
  })
})

describe('widgetsFromSchemaFields', () => {
  it('synthesizes one widget per field, key=field name (auto-binds to pin by label match)', () => {
    const out = widgetsFromSchemaFields({ name: 'Ada', priority: 0, ready: true })
    expect(out.map((w) => w.key)).toEqual(['name', 'priority', 'ready'])
  })

  it('picks widget type from the default value (string→text, number→number, boolean→toggle)', () => {
    const out = widgetsFromSchemaFields({ name: 'Ada', priority: 0.5, ready: true })
    const byKey = Object.fromEntries(out.map((w) => [w.key, w.type]))
    expect(byKey).toEqual({ name: 'text', priority: 'number', ready: 'toggle' })
  })

  it('arrays / objects / null / undefined → DISABLED text widget (read-only display, not editable)', () => {
    // No sensible editable widget for an array/object value; the pin still receives wires, the
    // widget just shows the current value as a comma-joined / stringified text the user CAN'T edit.
    const out = widgetsFromSchemaFields({ tags: ['a', 'b'], meta: { x: 1 }, none: null, miss: undefined })
    for (const w of out) {
      expect(w.type).toBe('text')
      expect((w as { disabled?: boolean }).disabled).toBe(true)
    }
  })

  it('scalar widgets are NOT disabled (user must be able to edit name / priority / ready)', () => {
    const out = widgetsFromSchemaFields({ name: 'Ada', priority: 0.5, ready: true })
    for (const w of out) {
      expect((w as { disabled?: boolean }).disabled).not.toBe(true)
    }
  })

  it('label is empty (the pin already shows the field name on its row)', () => {
    const out = widgetsFromSchemaFields({ name: 'Ada' })
    expect(out[0]!.label).toBe('')
  })

  it('widget id is `field:<key>` so it does not collide with hand-authored widget ids', () => {
    const out = widgetsFromSchemaFields({ priority: 0 })
    expect(out[0]!.id).toBe('field:priority')
  })

  it('empty schema → empty array', () => {
    expect(widgetsFromSchemaFields({})).toEqual([])
  })
})

describe('pinsFromSchemaFields — extraPins', () => {
  const extras: SchemaExtraPin[] = [
    { label: 'subscribe', direction: 'in',  type: 'goodie-rec', multiple: true },
    { label: 'world',     direction: 'out', type: 'object' },
  ]

  it('synthesizes one pin per extra with id `extra:<label>` alongside the field pins', () => {
    const out = pinsFromSchemaFields([schemaPin, selfPin], { name: 'Ada' }, extras)
    expect(out.map((p) => p.id)).toEqual(['p:schema', 'p:self', 'field:name', 'extra:subscribe', 'extra:world'])
  })

  it('an extra pin carries the declared direction / type / multiple, not the field defaults', () => {
    const out = pinsFromSchemaFields([schemaPin, selfPin], {}, extras)
    const sub = out.find((p) => p.id === 'extra:subscribe')!
    expect(sub).toEqual({ id: 'extra:subscribe', kind: 'data', direction: 'in',  type: 'goodie-rec', multiple: true,  label: 'subscribe' })
    const world = out.find((p) => p.id === 'extra:world')!
    expect(world).toEqual({ id: 'extra:world', kind: 'data', direction: 'out', type: 'object', multiple: false, label: 'world' })
  })

  it('re-sync strips ALL extras when the new extras list is empty — base pins survive', () => {
    const first  = pinsFromSchemaFields([schemaPin, selfPin], { name: 'Ada' }, extras)
    const second = pinsFromSchemaFields(first,                { name: 'Ada' }, [])
    expect(second.map((p) => p.id)).toEqual(['p:schema', 'p:self', 'field:name'])
  })

  it('schema disconnect (empty fields AND empty extras) strips everything down to base', () => {
    const before = pinsFromSchemaFields([schemaPin, selfPin], { name: 'Ada' }, extras)
    const after  = pinsFromSchemaFields(before, {}, [])
    expect(after.map((p) => p.id)).toEqual(['p:schema', 'p:self'])
  })
})
