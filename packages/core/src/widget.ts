import type { Node } from './graph.js'

/** Declarative in-node UI control. Widgets are pure DATA — rendering and interaction live in the
 *  render/editor layers. A widget's value is stored in `node.state[key]` (single source of truth),
 *  so it serialises with the node and mutates through the command bus (undoable). `button` carries
 *  an action name instead of a value; `custom` defers to a host-registered renderer. */
export type WidgetType = 'number' | 'slider' | 'combo' | 'text' | 'toggle' | 'button' | 'color' | 'custom'

export type ComboOption = string | { label: string; value: string | number }

/** Per-widget visual override. Any field set here wins over the theme's widget tokens for THIS
 *  widget only — so every widget instance is fully customisable without touching the theme. */
export interface WidgetStyle {
  bg?: string
  bgHover?: string
  bgFocused?: string
  track?: string
  fill?: string
  fillAlpha?: number
  text?: string
  label?: string
  placeholder?: string
  border?: string
  borderFocused?: string
  selection?: string
  knob?: string
  radius?: number
  paddingX?: number
  paddingY?: number
  borderWidth?: number
  toggleWidth?: number
  toggleHeight?: number
}

interface WidgetBase {
  id: string
  label: string
  /** Key into `node.state` holding the value. Absent for `button`. Also doubles as the implicit
   *  pin-binding key (see `pinKey`) — most schemas don't need to set `pinKey` manually if the
   *  widget's `key` matches a data IN-pin's `label` / `id`. */
  key?: string
  disabled?: boolean
  hint?: string
  /** Per-widget visual override, merged over the theme's widget tokens. */
  style?: WidgetStyle
  /** Override the implicit `key`-based pin match. Matched against a data IN-pin's `label` (schema
   *  authors can't predict auto-minted pin ids), then by pin `id` (loaded graphs serialize ids).
   *  Almost never needed — leave unset and use the same `key` on widget and pin. */
  pinKey?: string
  /** Render-time visibility against the bound pin:
   *  - `'whenDisconnected'` (default for input controls — number/slider/text/combo/toggle/color):
   *    UE-Blueprint default-value behaviour. Widget visible only while the pin has no edge;
   *    connecting hides it (the pin's wire becomes the value source).
   *  - `'always'`: display/preview behaviour. Widget always visible regardless of pin state;
   *    when the pin has a wire, the widget reads the runtime's LIVE value and renders read-only.
   *    Default for `custom` widgets — most custom controls are visualisations. */
  visibility?: 'whenDisconnected' | 'always'
}

export type WidgetSpec =
  | (WidgetBase & { type: 'number'; key: string; min?: number; max?: number; step?: number; precision?: number; unit?: string })
  | (WidgetBase & { type: 'slider'; key: string; min: number; max: number; step?: number })
  | (WidgetBase & { type: 'combo';  key: string; values: ComboOption[] })
  | (WidgetBase & { type: 'text';   key: string; multiline?: boolean; placeholder?: string; maxLength?: number })
  | (WidgetBase & { type: 'toggle'; key: string; onLabel?: string; offLabel?: string })
  | (WidgetBase & { type: 'button'; action: string })
  | (WidgetBase & { type: 'color';  key: string })
  | (WidgetBase & { type: 'custom'; renderer: string; key: string; height?: number })

export interface ComboOptionResolved {
  label: string
  value: string | number
}

export function comboOptions(spec: Extract<WidgetSpec, { type: 'combo' }>): ComboOptionResolved[] {
  return spec.values.map((o) =>
    typeof o === 'object' ? { label: o.label, value: o.value } : { label: o, value: o },
  )
}

export function defaultWidgetValue(spec: WidgetSpec): unknown {
  switch (spec.type) {
    case 'number': return spec.min ?? 0
    case 'slider': return spec.min
    case 'combo':  return comboOptions(spec)[0]?.value
    case 'text':   return ''
    case 'toggle': return false
    case 'color':  return '#6c8ebf'
    case 'button':
    case 'custom': return undefined
  }
}

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/** Normalise a colour to a 6-digit lowercase hex (`#rrggbb`), expanding 3-digit shorthand. */
function normalizeHex(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!HEX_RE.test(s)) return null
  const body = s.slice(1)
  const full = body.length === 3 ? body.split('').map((ch) => ch + ch).join('') : body
  return `#${full.toLowerCase()}`
}

function quantize(value: number, min: number, step: number): number {
  const snapped = min + Math.round((value - min) / step) * step
  // Kill floating-point dust from the multiply (e.g. 0.30000000000000004).
  return Number(snapped.toFixed(10))
}

export function clampWidgetValue(spec: WidgetSpec, raw: unknown): unknown {
  switch (spec.type) {
    case 'number': {
      let v = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(v)) return defaultWidgetValue(spec)
      const min = spec.min ?? -Infinity
      const max = spec.max ?? Infinity
      v = Math.min(max, Math.max(min, v))
      if (spec.step && spec.step > 0) v = Math.min(max, Math.max(min, quantize(v, Number.isFinite(min) ? min : 0, spec.step)))
      if (spec.precision !== undefined) v = Number(v.toFixed(spec.precision))
      return v
    }
    case 'slider': {
      let v = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isFinite(v)) return defaultWidgetValue(spec)
      v = Math.min(spec.max, Math.max(spec.min, v))
      if (spec.step && spec.step > 0) v = Math.min(spec.max, Math.max(spec.min, quantize(v, spec.min, spec.step)))
      return v
    }
    case 'combo': {
      const opts = comboOptions(spec)
      return opts.some((o) => o.value === raw) ? raw : opts[0]?.value
    }
    case 'text': {
      let s = String(raw ?? '')
      if (spec.maxLength !== undefined) s = s.slice(0, spec.maxLength)
      return s
    }
    case 'toggle':
      return Boolean(raw)
    case 'color':
      return normalizeHex(raw) ?? defaultWidgetValue(spec)
    case 'button':
      return undefined
    case 'custom':
      return raw
  }
}

/** Current value of a widget on a node: the clamped `node.state[key]`, or its default. */
export function widgetValue(node: Node, spec: WidgetSpec): unknown {
  if (spec.key === undefined) return defaultWidgetValue(spec)
  const stored = node.state[spec.key]
  return stored === undefined ? defaultWidgetValue(spec) : clampWidgetValue(spec, stored)
}

/** Effective widget visibility policy. ALL widget types default to `'whenDisconnected'` — they're
 *  input controls that the user sets a value for, and connecting a wire makes the widget's value
 *  redundant. Display/preview widgets (e.g. an Output node's value readout) opt into `'always'`
 *  explicitly. `button` widgets aren't pin-bound — they live in the actions row. */
export function widgetVisibility(spec: WidgetSpec): 'whenDisconnected' | 'always' {
  return spec.visibility ?? 'whenDisconnected'
}

/** The lookup key used to bind a widget to its pin: explicit `pinKey`, else the widget's `key`.
 *  Returns undefined for widgets that don't bind to a pin (`button` — actions, not values). */
export function widgetBindKey(spec: WidgetSpec): string | undefined {
  if (spec.type === 'button') return undefined
  return spec.pinKey ?? spec.key
}
