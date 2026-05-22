import { describe, it, expect } from 'vitest'
import { xenTokens } from './index.js'
import { mergeTheme } from './merge.js'

describe('mergeTheme', () => {
  it('returns the base unchanged when override is empty', () => {
    const merged = mergeTheme(xenTokens, {})
    expect(merged).toEqual(xenTokens)
  })

  it('returns a new object — does not mutate the base', () => {
    const merged = mergeTheme(xenTokens, { color: { brand: { primary: '#FF00FF' } } })
    expect(merged).not.toBe(xenTokens)
    expect(xenTokens.color.brand['primary']).toBe('#FCB400')
  })

  it('shallow override of brand colors', () => {
    const merged = mergeTheme(xenTokens, { color: { brand: { primary: '#FF00FF' } } })
    expect(merged.color.brand['primary']).toBe('#FF00FF')
    // other brand colors stay
    expect(merged.color.brand['primaryDark']).toBe(xenTokens.color.brand['primaryDark'])
  })

  it('deep override of a pin type', () => {
    const merged = mergeTheme(xenTokens, {
      pinType: { float: { color: '#00FFAA' } },
    })
    expect(merged.pinType.float.color).toBe('#00FFAA')
    // the rest of float stays
    expect(merged.pinType.float.shape).toBe(xenTokens.pinType.float.shape)
    // other pins stay
    expect(merged.pinType.object.color).toBe(xenTokens.pinType.object.color)
  })

  it('override of a category accent', () => {
    const merged = mergeTheme(xenTokens, {
      category: { logic: { accent: '#00FF00' } },
    })
    expect(merged.category.logic.accent).toBe('#00FF00')
    expect(merged.category.data.accent).toBe(xenTokens.category.data.accent)
  })

  it('deep override of geometry.node', () => {
    const merged = mergeTheme(xenTokens, {
      geometry: { node: { radius: 14, minWidth: 200 } },
    })
    expect(merged.geometry.node.radius).toBe(14)
    expect(merged.geometry.node.minWidth).toBe(200)
    // unchanged
    expect(merged.geometry.node.headerHeight).toBe(xenTokens.geometry.node.headerHeight)
    // other geometry sections stay
    expect(merged.geometry.pin.diameter).toBe(xenTokens.geometry.pin.diameter)
  })

  it('overrides surface colors', () => {
    const merged = mergeTheme(xenTokens, {
      color: { surface: { canvas: '#000000', node: '#222222' } },
    })
    expect(merged.color.surface.canvas).toBe('#000000')
    expect(merged.color.surface.node).toBe('#222222')
    expect(merged.color.surface.panel).toBe(xenTokens.color.surface.panel)
  })

  it('arrays inside the theme are replaced wholesale (not merged element-wise)', () => {
    // contrived test — there are no array tokens currently, but the merge rule should be
    // explicit so we don't surprise consumers later if we add arrays.
    const merged = mergeTheme(
      { ...xenTokens, sample: [1, 2, 3] } as never,
      { sample: [9] } as never,
    ) as unknown as { sample: number[] }
    expect(merged.sample).toEqual([9])
  })
})
