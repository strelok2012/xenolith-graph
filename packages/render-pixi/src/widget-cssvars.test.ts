import { describe, it, expect } from 'vitest'
import { resolveWidgetStyle, widgetCssVars } from './widget-renderer.js'
import { xenTheme } from './xen-theme.js'

describe('widgetCssVars', () => {
  it('maps the resolved widget style to --xeno-* CSS custom properties', () => {
    const style = resolveWidgetStyle(xenTheme.tokens)
    const vars = widgetCssVars(style)
    expect(vars['--xeno-accent']).toBe(style.fill)
    expect(vars['--xeno-text']).toBe(style.text)
    expect(vars['--xeno-muted']).toBe(style.label)
    expect(vars['--xeno-bg']).toBe(style.bg)
    expect(vars['--xeno-radius']).toBe(`${style.radius}px`)
    // every key is a CSS custom property
    expect(Object.keys(vars).every((k) => k.startsWith('--xeno-'))).toBe(true)
  })

  it('reflects a per-widget style override', () => {
    const vars = widgetCssVars(resolveWidgetStyle(xenTheme.tokens, { fill: '#ff0000' }))
    expect(vars['--xeno-accent']).toBe('#ff0000')
  })
})
