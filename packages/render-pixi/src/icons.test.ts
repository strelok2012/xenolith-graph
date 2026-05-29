import { describe, it, expect } from 'vitest'
import { IconRegistry, BUILTIN_ICONS } from './icons.js'

describe('IconRegistry', () => {
  it('is seeded with the built-in icon set', () => {
    const reg = new IconRegistry()
    expect(reg.has('layers')).toBe(true)
    expect(reg.has('box')).toBe(true)
    expect(reg.has('cpu')).toBe(true)
    expect(reg.get('layers')).toBe(BUILTIN_ICONS['layers'])
    expect(reg.names().length).toBeGreaterThanOrEqual(Object.keys(BUILTIN_ICONS).length)
  })

  it('registers and resolves a custom icon', () => {
    const reg = new IconRegistry()
    reg.register('rocket', '<path d="M5 5 19 19"/>')
    expect(reg.has('rocket')).toBe(true)
    expect(reg.get('rocket')).toBe('<path d="M5 5 19 19"/>')
  })

  it('register overrides a built-in of the same name', () => {
    const reg = new IconRegistry()
    reg.register('layers', '<circle cx="12" cy="12" r="5"/>')
    expect(reg.get('layers')).toBe('<circle cx="12" cy="12" r="5"/>')
  })

  it('unregister / unknown lookup', () => {
    const reg = new IconRegistry()
    expect(reg.unregister('cpu')).toBe(true)
    expect(reg.has('cpu')).toBe(false)
    expect(reg.get('nope')).toBeUndefined()
  })

  it('built-in icons use no polyline/polygon (PIXI decimal-split bug)', () => {
    for (const [name, svg] of Object.entries(BUILTIN_ICONS)) {
      expect(svg, name).not.toMatch(/<polyline|<polygon/)
    }
  })
})
