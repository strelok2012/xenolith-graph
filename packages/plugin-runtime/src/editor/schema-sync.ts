// Schema → Struct pin synthesis. A connected Schema's `state.fields` object (`{name: default}`) is
// turned into one data-in Pin per key on the Struct. Pure helpers — the plugin's edge listener
// calls them and forwards the result to `ctx.setNodePins`. Pin id convention: `field:<key>` so the
// Struct V3 evaluator (which derives field name from id suffix after `:`) sees the right field.

import type { Pin, PinId, WidgetSpec } from '@xenolith/core'

/** Declaration for a non-field pin synthesized from a Schema (multi-inputs, named outputs, etc.).
 *  Lives in `Schema.state.extraPins` so the graph author can express things that don't fit the
 *  flat `state.fields = {key: defaultValue}` model — e.g. an Agent's `subscribe` multi pin. */
export interface SchemaExtraPin {
  label: string
  direction: 'in' | 'out'
  type: string
  multiple?: boolean
}

/** Map a default value's runtime type to a pin type. `null`/`undefined` → `'any'`. */
export function schemaPinTypeFor(defaultValue: unknown): string {
  if (defaultValue === null || defaultValue === undefined) return 'any'
  if (typeof defaultValue === 'string') return 'string'
  if (typeof defaultValue === 'number') return 'scalar'
  if (typeof defaultValue === 'boolean') return 'bool'
  if (Array.isArray(defaultValue)) return 'array'
  if (typeof defaultValue === 'object') return 'object'
  return 'any'
}

/** Replace any prior `field:*` AND `extra:*` pins on the node with a fresh set derived from the
 *  Schema's `state.fields` (one IN-pin per key) and `state.extraPins` (verbatim declarations).
 *  Non-synthesized pins (the schema in-pin, the self out-pin) are kept in place at the front of
 *  the result so the binding pin survives a re-sync. Order: kept-base + field:* + extra:*. */
export function pinsFromSchemaFields(
  current: ReadonlyArray<Pin>,
  fields: Readonly<Record<string, unknown>>,
  extras: ReadonlyArray<SchemaExtraPin> = [],
): Pin[] {
  const kept = current.filter((p) => {
    const id = String(p.id)
    return !id.startsWith('field:') && !id.startsWith('extra:')
  })
  const fieldPins: Pin[] = Object.keys(fields).map((key) => ({
    id: (`field:${key}`) as PinId,
    kind: 'data',
    direction: 'in',
    type: schemaPinTypeFor(fields[key]),
    multiple: false,
    label: key,
  }))
  const extraPins: Pin[] = extras.map((spec) => ({
    id: (`extra:${spec.label}`) as PinId,
    kind: 'data',
    direction: spec.direction,
    type: spec.type,
    multiple: spec.multiple ?? false,
    label: spec.label,
  }))
  return [...kept, ...fieldPins, ...extraPins]
}

/** Synthesize one WidgetSpec per field on a Schema. `key = fieldName` so the editor's implicit
 *  pinKey-binding kicks in (widget hides when its matching pin is wired, shows otherwise). Label
 *  is empty — the pin row already shows the field name on the left, a second copy inside the
 *  chip would just duplicate it.
 *  - string  → text (editable)
 *  - number  → number (editable)
 *  - boolean → toggle
 *  - array/object/null/undefined → DISABLED text (read-only display; no editable widget exists
 *    for these types, but we still render the current value so the user sees what's in state). */
export function widgetsFromSchemaFields(fields: Readonly<Record<string, unknown>>): WidgetSpec[] {
  return Object.keys(fields).map((key): WidgetSpec => {
    const v = fields[key]
    const id = `field:${key}`
    if (typeof v === 'string')  return { id, type: 'text',   key, label: '' }
    if (typeof v === 'number')  return { id, type: 'number', key, label: '' }
    if (typeof v === 'boolean') return { id, type: 'toggle', key, label: '' }
    return { id, type: 'text', key, label: '', disabled: true }
  })
}
