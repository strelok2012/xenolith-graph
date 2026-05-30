// DOM widget for the `Struct` primitive — renders one row per field in `state.data` (an object) and
// commits edits back via setValue. The widget IS the field editor: the field LIST is derived from the
// data object itself (its keys), so adding/removing a field just means adding/removing a key.
//
// Field types are inferred from the current value: number → number input, boolean → checkbox, array
// → comma-separated text (cast back), everything else → text. This keeps the widget zero-config —
// the user just types values and the Struct emits the parsed record.

import type { DomWidgetController } from '@xenolith/editor'

/** Supported field types in a Struct. Drives both the input element rendered in the widget and
 *  the cast applied by {@link structChangeType} when the user switches a field's type. */
export type StructKind = 'number' | 'boolean' | 'array' | 'text'

/** A row to render in the widget. */
export interface StructRow {
  key: string
  value: unknown
  kind: StructKind
}

function classify(value: unknown): StructKind {
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (Array.isArray(value)) return 'array'
  return 'text'
}

/** Default value emitted when a new field of the given kind is created. */
function defaultFor(kind: StructKind): unknown {
  if (kind === 'number') return 0
  if (kind === 'boolean') return false
  if (kind === 'array') return []
  return ''
}

function asRecord(data: unknown): Record<string, unknown> {
  return (data && typeof data === 'object' && !Array.isArray(data)) ? (data as Record<string, unknown>) : {}
}

/** Decompose `state.data` into one row per field. Non-object inputs decode to no rows (Struct's
 *  evaluator already coerces to `{}`). Key order matches `Object.keys`. */
export function structRows(data: unknown): StructRow[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return []
  const rec = data as Record<string, unknown>
  return Object.keys(rec).map((key) => ({ key, value: rec[key], kind: classify(rec[key]) }))
}

/** Parse a raw string back to the type implied by the original value. Arrays come back via
 *  comma-split + trim; numbers via `Number()` (NaN preserved as-is so the user sees their bad
 *  input rather than a silent 0); booleans via the checkbox path so this only handles primitives. */
export function structParseValue(raw: string, kind: StructRow['kind']): unknown {
  if (kind === 'number') return raw === '' ? 0 : Number(raw)
  if (kind === 'array') return raw === '' ? [] : raw.split(',').map((s) => s.trim()).filter(Boolean)
  return raw
}

/** Apply one field change to the data record. Pure — returns a new object so the editor can detect
 *  the mutation via reference equality. Unknown data shapes are normalised to {}. */
export function structSetField(data: unknown, key: string, value: unknown): Record<string, unknown> {
  return { ...asRecord(data), [key]: value }
}

/** Append a new field with the type's default value. Existing fields keep their insertion order. */
export function structAddField(data: unknown, key: string, kind: StructKind): Record<string, unknown> {
  return { ...asRecord(data), [key]: defaultFor(kind) }
}

/** Delete a field. No-op if the key is absent. */
export function structRemoveField(data: unknown, key: string): Record<string, unknown> {
  const base = asRecord(data)
  if (!(key in base)) return { ...base }
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(base)) if (k !== key) out[k] = base[k]
  return out
}

/** Rename a key in place — same value, same position. No-op if old absent, new exists, or no-op. */
export function structRenameField(data: unknown, oldKey: string, newKey: string): Record<string, unknown> {
  const base = asRecord(data)
  if (oldKey === newKey) return { ...base }
  if (!(oldKey in base)) return { ...base }
  if (newKey in base) return { ...base } // refuse to overwrite
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(base)) out[k === oldKey ? newKey : k] = base[k]
  return out
}

/** Re-cast a field's value to a new kind. Conversions:
 *  - text → number: `Number()`, NaN → 0
 *  - any → text: `String()` (arrays join with comma+space)
 *  - any → boolean: truthy-check (empty string / 0 → false)
 *  - text → array: comma-split + trim
 *  No-op if the key is absent. */
export function structChangeType(data: unknown, key: string, kind: StructKind): Record<string, unknown> {
  const base = asRecord(data)
  if (!(key in base)) return { ...base }
  const v = base[key]
  let next: unknown
  if (kind === 'number') {
    const n = typeof v === 'number' ? v : Number(typeof v === 'string' ? v : String(v))
    next = Number.isFinite(n) ? n : 0
  } else if (kind === 'boolean') {
    next = !!v
  } else if (kind === 'array') {
    if (Array.isArray(v)) next = v
    else if (typeof v === 'string') next = v === '' ? [] : v.split(',').map((s) => s.trim()).filter(Boolean)
    else next = []
  } else {
    // text
    if (Array.isArray(v)) next = (v as unknown[]).join(', ')
    else next = String(v ?? '')
  }
  return { ...base, [key]: next }
}

/** Generate a fresh, non-colliding `fieldN` key (lowest N not yet used). */
export function structFreshKey(data: unknown): string {
  const used = new Set(Object.keys(asRecord(data)))
  for (let i = 1; ; i++) { const k = `field${i}`; if (!used.has(k)) return k }
}

// Per-node re-render hook; `update()` from the editor re-paints the rows with the latest value.
// Keyed by node id — one Struct widget per node, so the key is unique.
const renderHooks = new Map<string, (data: unknown) => void>()

const KIND_CHOICES: StructKind[] = ['text', 'number', 'boolean', 'array']

// `width:0;flex:1 1 0` is the standard trick to make a flex `<input>` actually shrink — without
// it the browser's intrinsic input width (~150px) wins over `min-width:0` and pushes the row.
const css = {
  // Very compact rhythm: tiny font + minimal paddings keep each row ~18 px so a 4-field schema
  // fits in ~96 px (declared `height` in the spec). Horizontal padding is 0 — the widget rect's
  // x extent already equals the pin-label content column (core's pin-edge alignment), an extra
  // inset would double-indent.
  // Stretch to fill the rect the editor gave us; SCROLL inside when content (rows + add button)
  // exceeds the declared widget `height` — otherwise the "+ add field" button slides off-screen
  // as the user adds fields and there's no way to add more.
  root:   'display:flex;flex-direction:column;gap:2px;font:10px Inter,sans-serif;padding:2px 0;box-sizing:border-box;width:100%;height:100%;overflow-y:auto',
  row:    'display:flex;align-items:center;gap:3px;height:18px',
  key:    'width:0;flex:1 1 0;min-width:40px;height:16px;background:transparent;color:var(--xeno-widget-label,#aaa);border:1px dashed transparent;border-radius:2px;padding:0 3px;font:inherit;cursor:text;box-sizing:border-box',
  keyHov: 'border-color:var(--xeno-widget-border,#444)',
  input:  'width:0;flex:2 1 0;min-width:30px;height:16px;background:var(--xeno-widget-bg,#222);color:var(--xeno-widget-text,#eee);border:1px solid var(--xeno-widget-border,#444);border-radius:2px;padding:0 3px;font:inherit;box-sizing:border-box',
  kind:   'flex:0 0 auto;height:16px;background:var(--xeno-widget-bg,#222);color:var(--xeno-widget-text,#eee);border:1px solid var(--xeno-widget-border,#444);border-radius:2px;padding:0 2px;font:inherit;cursor:pointer;box-sizing:border-box',
  drop:   'flex:0 0 14px;width:14px;height:16px;padding:0;background:transparent;color:var(--xeno-widget-label,#666);border:none;border-radius:2px;cursor:pointer;font:12px/1 monospace',
  add:    'margin-top:1px;height:16px;padding:0 4px;background:transparent;color:var(--xeno-widget-label,#888);border:1px dashed var(--xeno-widget-border,#444);border-radius:2px;cursor:pointer;font:inherit;text-align:left;box-sizing:border-box',
}

export const structWidget: DomWidgetController = {
  mount(el, { value, setValue, node }) {
    const root = document.createElement('div')
    root.style.cssText = css.root
    el.appendChild(root)
    let current: unknown = value

    const render = (data: unknown): void => {
      current = data
      root.innerHTML = ''
      for (const row of structRows(data)) {
        const line = document.createElement('div')
        line.style.cssText = css.row

        // Key (rename inline — contenteditable-ish text input that commits on blur).
        const keyEl = document.createElement('input')
        keyEl.value = row.key
        keyEl.style.cssText = css.key
        keyEl.title = 'rename field'
        keyEl.addEventListener('focus',  () => { keyEl.style.cssText = `${css.key};${css.keyHov}` })
        keyEl.addEventListener('blur',   () => {
          keyEl.style.cssText = css.key
          const next = keyEl.value.trim()
          if (!next || next === row.key) { keyEl.value = row.key; return }
          const result = structRenameField(current, row.key, next)
          // structRenameField returns unchanged base when newKey collides; restore the input then.
          if (!(next in result)) { keyEl.value = row.key; return }
          setValue(result)
        })

        // Value input.
        const input = (row.kind === 'boolean')
          ? Object.assign(document.createElement('input'), { type: 'checkbox', checked: !!row.value })
          : Object.assign(document.createElement('input'), {
              type:  row.kind === 'number' ? 'number' : 'text',
              value: row.kind === 'array'  ? (row.value as unknown[]).join(', ') : String(row.value ?? ''),
            })
        input.style.cssText = css.input
        input.addEventListener('change', () => {
          const next = (row.kind === 'boolean')
            ? (input as HTMLInputElement).checked
            : structParseValue((input as HTMLInputElement).value, row.kind)
          setValue(structSetField(current, row.key, next))
        })

        // Type picker (text/number/boolean/array).
        const kindSel = document.createElement('select')
        kindSel.style.cssText = css.kind
        kindSel.title = 'field type'
        for (const k of KIND_CHOICES) {
          const opt = document.createElement('option')
          opt.value = k; opt.textContent = k
          if (k === row.kind) opt.selected = true
          kindSel.appendChild(opt)
        }
        kindSel.addEventListener('change', () => setValue(structChangeType(current, row.key, kindSel.value as StructKind)))

        // Delete button.
        const del = document.createElement('button')
        del.type = 'button'
        del.textContent = '×'
        del.title = 'remove field'
        del.style.cssText = css.drop
        del.addEventListener('click', () => setValue(structRemoveField(current, row.key)))

        line.appendChild(keyEl); line.appendChild(input); line.appendChild(kindSel); line.appendChild(del)
        root.appendChild(line)
      }

      // "+ add field" — appends a fresh text field; user immediately edits its key and type.
      const add = document.createElement('button')
      add.type = 'button'
      add.textContent = '+ add field'
      add.style.cssText = css.add
      add.addEventListener('click', () => setValue(structAddField(current, structFreshKey(current), 'text')))
      root.appendChild(add)
    }

    const key = String(node.id)
    renderHooks.set(key, render)
    render(value)
    return () => { renderHooks.delete(key); root.remove() }
  },
  update({ value, node }) {
    // The editor calls update on external changes (undo, programmatic setWidgetValue, scatter
    // writeback). Find the per-node render hook stored at mount time.
    renderHooks.get(String(node.id))?.(value)
  },
}
