import { describe, it, expect } from 'vitest'
import { themeCssVars } from './widget-renderer.js'
import { xenTheme } from './xen-theme.js'

describe('themeCssVars', () => {
  it('maps the active theme tokens to panel/control --xeno-* CSS custom properties', () => {
    const vars = themeCssVars(xenTheme.tokens)
    const t = xenTheme.tokens.color
    expect(vars['--xeno-accent']).toBe(t.widget.fill)
    expect(vars['--xeno-canvas']).toBe(t.surface.canvas)
    expect(vars['--xeno-panel']).toBe(t.surface.panel)
    expect(vars['--xeno-elevated']).toBe(t.surface.elevated)
    expect(vars['--xeno-text']).toBe(t.text.primary)
    expect(vars['--xeno-text-secondary']).toBe(t.text.secondary)
    expect(vars['--xeno-muted']).toBe(t.text.muted)
    expect(vars['--xeno-border']).toBe(t.surface.outline)
    expect(vars['--xeno-divider']).toBe(t.surface.divider)
    expect(vars['--xeno-radius']).toBe(`${xenTheme.tokens.geometry.widget.radius}px`)
  })

  it('every key is an --xeno- custom property', () => {
    const vars = themeCssVars(xenTheme.tokens)
    expect(Object.keys(vars).every((k) => k.startsWith('--xeno-'))).toBe(true)
  })
})
