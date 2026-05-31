import { describe, it, expect } from 'vitest'
import {
  defaultWidgetValue,
  widgetValue,
  clampWidgetValue,
  comboOptions,
  widgetVisibility,
  widgetBindKey,
  widgetIsVisible,
  type WidgetSpec,
} from './widget.js'
import type { Node } from './graph.js'

function node(state: Record<string, unknown>): Node {
  return { id: 'n1' as Node['id'], type: 'T', position: { x: 0, y: 0 }, state, pins: [] }
}

const number = (o: Partial<Extract<WidgetSpec, { type: 'number' }>> = {}): WidgetSpec =>
  ({ id: 'w', type: 'number', label: 'N', key: 'n', ...o })
const slider = (o: Partial<Extract<WidgetSpec, { type: 'slider' }>> = {}): WidgetSpec =>
  ({ id: 'w', type: 'slider', label: 'S', key: 's', min: 0, max: 10, ...o })
const combo = (values: Extract<WidgetSpec, { type: 'combo' }>['values']): WidgetSpec =>
  ({ id: 'w', type: 'combo', label: 'C', key: 'c', values })

describe('defaultWidgetValue', () => {
  it('number defaults to min, or 0 when no min', () => {
    expect(defaultWidgetValue(number())).toBe(0)
    expect(defaultWidgetValue(number({ min: 5 }))).toBe(5)
  })
  it('slider defaults to min', () => {
    expect(defaultWidgetValue(slider({ min: 2, max: 8 }))).toBe(2)
  })
  it('combo defaults to the first option value (normalised)', () => {
    expect(defaultWidgetValue(combo(['a', 'b']))).toBe('a')
    expect(defaultWidgetValue(combo([{ label: 'Lo', value: 1 }, { label: 'Hi', value: 2 }]))).toBe(1)
  })
  it('text→"", toggle→false, button→undefined', () => {
    expect(defaultWidgetValue({ id: 'w', type: 'text', label: 'T', key: 't' })).toBe('')
    expect(defaultWidgetValue({ id: 'w', type: 'toggle', label: 'B', key: 'b' })).toBe(false)
    expect(defaultWidgetValue({ id: 'w', type: 'button', label: 'Go', action: 'go' })).toBeUndefined()
  })
})

describe('clampWidgetValue', () => {
  it('number clamps to min/max', () => {
    expect(clampWidgetValue(number({ min: 0, max: 10 }), 99)).toBe(10)
    expect(clampWidgetValue(number({ min: 0, max: 10 }), -5)).toBe(0)
  })
  it('number quantises to step (anchored at min) and coerces strings', () => {
    expect(clampWidgetValue(number({ min: 0, max: 10, step: 0.5 }), 1.2)).toBe(1)
    expect(clampWidgetValue(number({ min: 0, max: 10, step: 0.5 }), 1.3)).toBe(1.5)
    expect(clampWidgetValue(number({ min: 0, max: 10, step: 2 }), '7')).toBe(8)
  })
  it('number applies precision and falls back to default on NaN', () => {
    expect(clampWidgetValue(number({ precision: 2 }), 1.23456)).toBe(1.23)
    expect(clampWidgetValue(number({ min: 3 }), 'abc')).toBe(3)
  })
  it('slider clamps within [min,max]', () => {
    expect(clampWidgetValue(slider({ min: 0, max: 10 }), 12)).toBe(10)
  })
  it('combo snaps to an allowed value, else first', () => {
    expect(clampWidgetValue(combo(['a', 'b']), 'b')).toBe('b')
    expect(clampWidgetValue(combo(['a', 'b']), 'zzz')).toBe('a')
    expect(clampWidgetValue(combo([{ label: 'Hi', value: 2 }]), 2)).toBe(2)
  })
  it('text coerces to string and respects maxLength', () => {
    expect(clampWidgetValue({ id: 'w', type: 'text', label: 'T', key: 't' }, 42)).toBe('42')
    expect(clampWidgetValue({ id: 'w', type: 'text', label: 'T', key: 't', maxLength: 3 }, 'abcdef')).toBe('abc')
  })
  it('toggle coerces to boolean', () => {
    expect(clampWidgetValue({ id: 'w', type: 'toggle', label: 'B', key: 'b' }, 1)).toBe(true)
    expect(clampWidgetValue({ id: 'w', type: 'toggle', label: 'B', key: 'b' }, 0)).toBe(false)
  })

  it('color normalises hex (expands shorthand, lowercases) and rejects garbage', () => {
    const color: WidgetSpec = { id: 'w', type: 'color', label: 'C', key: 'c' }
    expect(clampWidgetValue(color, '#FFF')).toBe('#ffffff')
    expect(clampWidgetValue(color, '#1A2B3C')).toBe('#1a2b3c')
    expect(clampWidgetValue(color, 'red')).toBe('#6c8ebf')
    expect(clampWidgetValue(color, '#xyz')).toBe('#6c8ebf')
    expect(defaultWidgetValue(color)).toBe('#6c8ebf')
  })
})

describe('widgetValue', () => {
  it('reads node.state[key], clamped', () => {
    expect(widgetValue(node({ n: 5 }), number({ min: 0, max: 10 }))).toBe(5)
    expect(widgetValue(node({ n: 999 }), number({ min: 0, max: 10 }))).toBe(10)
  })
  it('falls back to the default when state has no value', () => {
    expect(widgetValue(node({}), slider({ min: 2, max: 8 }))).toBe(2)
  })
})

describe('comboOptions', () => {
  it('normalises string and object options to {label,value}', () => {
    expect(comboOptions(combo(['a', 'b']) as Extract<WidgetSpec, { type: 'combo' }>))
      .toEqual([{ label: 'a', value: 'a' }, { label: 'b', value: 'b' }])
    expect(comboOptions(combo([{ label: 'Hi', value: 2 }]) as Extract<WidgetSpec, { type: 'combo' }>))
      .toEqual([{ label: 'Hi', value: 2 }])
  })
})

describe('widgetVisibility', () => {
  it('input controls default to whenDisconnected (UE-style)', () => {
    expect(widgetVisibility(number())).toBe('whenDisconnected')
    expect(widgetVisibility(slider())).toBe('whenDisconnected')
    expect(widgetVisibility({ id: 'w', type: 'text',   label: 'T', key: 't' })).toBe('whenDisconnected')
    expect(widgetVisibility({ id: 'w', type: 'toggle', label: 'B', key: 'b' })).toBe('whenDisconnected')
    expect(widgetVisibility({ id: 'w', type: 'combo',  label: 'C', key: 'c', values: ['a'] })).toBe('whenDisconnected')
    expect(widgetVisibility({ id: 'w', type: 'color',  label: 'Cl', key: 'cl' })).toBe('whenDisconnected')
  })
  it('custom widgets also default to whenDisconnected — they are usually input controls (curve, XY pad)', () => {
    expect(widgetVisibility({ id: 'w', type: 'custom', renderer: 'foo', key: 'k', label: '' })).toBe('whenDisconnected')
  })
  it('explicit visibility wins over the default', () => {
    expect(widgetVisibility({ id: 'w', type: 'number', label: 'N', key: 'n', visibility: 'always' })).toBe('always')
    expect(widgetVisibility({ id: 'w', type: 'custom', renderer: 'foo', key: 'k', label: '', visibility: 'whenDisconnected' })).toBe('whenDisconnected')
  })
})

describe('widgetIsVisible (A1 — n8n-style displayOptions.show)', () => {
  it('returns true when displayOptions is absent (the default — every widget is visible)', () => {
    expect(widgetIsVisible(number(), node({}))).toBe(true)
    expect(widgetIsVisible({ id: 'b', type: 'button', label: '+', action: 'a' }, node({}))).toBe(true)
  })
  it('show callback evaluates against node.state — true keeps the widget, false hides it', () => {
    const body: WidgetSpec = { id: 'body', type: 'text', label: 'Body', key: 'body',
      displayOptions: { show: (s) => s['method'] === 'POST' } }
    expect(widgetIsVisible(body, node({ method: 'POST' }))).toBe(true)
    expect(widgetIsVisible(body, node({ method: 'GET' }))).toBe(false)
    expect(widgetIsVisible(body, node({}))).toBe(false)
  })
  it('a throwing show callback fails OPEN (treats the widget as visible) — schema bug must not blank the node', () => {
    const broken: WidgetSpec = { id: 'x', type: 'number', label: 'X', key: 'x',
      displayOptions: { show: () => { throw new Error('boom') } } }
    expect(widgetIsVisible(broken, node({}))).toBe(true)
  })
})

describe('widgetBindKey', () => {
  it('returns the widget key when no pinKey override is set', () => {
    expect(widgetBindKey(number())).toBe('n')
    expect(widgetBindKey({ id: 'w', type: 'custom', renderer: 'r', key: 'data', label: '' })).toBe('data')
  })
  it('pinKey wins over key when both are set', () => {
    expect(widgetBindKey({ ...number(), pinKey: 'value' } as WidgetSpec)).toBe('value')
  })
  it('button widgets are not pin-bound — they live in the actions row', () => {
    expect(widgetBindKey({ id: 'w', type: 'button', label: '+ add', action: 'addField' })).toBeUndefined()
  })
})
