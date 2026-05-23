import { describe, it, expect } from 'vitest'
import { xenTokens } from '@xenolith/theme-xen'
import {
  resolveCategoryAccent,
  resolvePinFill,
  resolvePinStroke,
  resolveEdgeColor,
  resolveCategoryGradient,
  hexToRgba,
} from './style.js'

describe('resolveCategoryAccent', () => {
  it('returns the accent for a known category', () => {
    expect(resolveCategoryAccent('logic', xenTokens)).toBe(xenTokens.category.logic.accent)
    expect(resolveCategoryAccent('data', xenTokens)).toBe(xenTokens.category.data.accent)
    expect(resolveCategoryAccent('macro', xenTokens)).toBe(xenTokens.category.macro.accent)
    expect(resolveCategoryAccent('utility', xenTokens)).toBe(xenTokens.category.utility.accent)
  })

  it('falls back to utility accent for unknown categories', () => {
    expect(resolveCategoryAccent('unknown', xenTokens)).toBe(xenTokens.category.utility.accent)
  })

  it('falls back to utility accent when category is undefined', () => {
    expect(resolveCategoryAccent(undefined, xenTokens)).toBe(xenTokens.category.utility.accent)
  })
})

describe('resolvePinFill', () => {
  it('returns the type color for known pin types', () => {
    expect(resolvePinFill('float', xenTokens)).toBe(xenTokens.pinType.float.color)
    expect(resolvePinFill('object', xenTokens)).toBe(xenTokens.pinType.object.color)
    expect(resolvePinFill('exec', xenTokens)).toBe(xenTokens.pinType.exec.color)
    expect(resolvePinFill('string', xenTokens)).toBe(xenTokens.pinType.string.color)
    expect(resolvePinFill('any', xenTokens)).toBe(xenTokens.pinType.any.color)
  })

  it('returns the node body color for the wildcard type — a ring around a dark center, not a hole', () => {
    expect(resolvePinFill('wildcard', xenTokens)).toBe(xenTokens.color.surface.node)
  })

  it('falls back to the any colour for unknown types', () => {
    expect(resolvePinFill('totally-made-up', xenTokens)).toBe(xenTokens.pinType.any.color)
  })
})

describe('resolvePinStroke', () => {
  it('returns the canvas-coloured stroke for normal pins', () => {
    expect(resolvePinStroke('float', xenTokens)).toBe(xenTokens.geometry.pin.strokeColor)
    expect(resolvePinStroke('object', xenTokens)).toBe(xenTokens.geometry.pin.strokeColor)
  })

  it('returns the type colour as stroke for the empty/wildcard pin', () => {
    expect(resolvePinStroke('wildcard', xenTokens)).toBe(xenTokens.pinType.wildcard.color)
  })

  it('falls back to canvas stroke for unknown types', () => {
    expect(resolvePinStroke('made-up', xenTokens)).toBe(xenTokens.geometry.pin.strokeColor)
  })
})

describe('resolveEdgeColor', () => {
  it('returns the edge colour declared by the source pin type', () => {
    expect(resolveEdgeColor('float',  xenTokens)).toBe(xenTokens.pinType.float.edgeColor)
    expect(resolveEdgeColor('object', xenTokens)).toBe(xenTokens.pinType.object.edgeColor)
    expect(resolveEdgeColor('string', xenTokens)).toBe(xenTokens.pinType.string.edgeColor)
    expect(resolveEdgeColor('exec',   xenTokens)).toBe(xenTokens.pinType.exec.edgeColor)
  })

  it('uses the wildcard edge colour for wildcard pins', () => {
    expect(resolveEdgeColor('wildcard', xenTokens)).toBe(xenTokens.pinType.wildcard.edgeColor)
  })

  it('falls back to the any edge colour for unknown source types', () => {
    expect(resolveEdgeColor('made-up', xenTokens)).toBe(xenTokens.pinType.any.edgeColor)
  })
})

describe('edge width signal', () => {
  it('exec edges declare a wider stroke than data edges', () => {
    expect(xenTokens.geometry.edge.execWidth).toBeGreaterThan(xenTokens.geometry.edge.width)
  })
})

describe('hexToRgba', () => {
  it('converts 6-digit hex with an alpha to css rgba()', () => {
    expect(hexToRgba('#85C244', 0.6)).toBe('rgba(133, 194, 68, 0.6)')
  })

  it('accepts hex without leading #', () => {
    expect(hexToRgba('FFFFFF', 1)).toBe('rgba(255, 255, 255, 1)')
  })

  it('clamps alpha to [0, 1]', () => {
    expect(hexToRgba('#000000', -0.5)).toBe('rgba(0, 0, 0, 0)')
    expect(hexToRgba('#000000', 5)).toBe('rgba(0, 0, 0, 1)')
  })

  it('expands 3-digit hex shorthand', () => {
    expect(hexToRgba('#FFF', 0.5)).toBe('rgba(255, 255, 255, 0.5)')
  })

  it('re-emits rgb() input with the new alpha (channels preserved)', () => {
    expect(hexToRgba('rgb(133, 194, 68)', 0.3)).toBe('rgba(133, 194, 68, 0.3)')
  })

  it('re-emits rgba() input with the new alpha overriding the original', () => {
    expect(hexToRgba('rgba(255, 255, 255, 0.07)', 0.5)).toBe('rgba(255, 255, 255, 0.5)')
  })
})

describe('resolveCategoryGradient', () => {
  it('starts at the category accent with 0.6 alpha', () => {
    expect(resolveCategoryGradient('logic', xenTokens).start).toBe(
      hexToRgba(xenTokens.category.logic.accent, 0.6),
    )
  })

  it('ends transparent (fades by opacity to simulate backdrop-blur into the body)', () => {
    const grad = resolveCategoryGradient('logic', xenTokens)
    expect(grad.end).toBe(hexToRgba(xenTokens.category.logic.accent, 0))
  })

  it('falls back to utility accent for unknown categories', () => {
    const grad = resolveCategoryGradient('made-up', xenTokens)
    expect(grad.start).toBe(hexToRgba(xenTokens.category.utility.accent, 0.6))
    expect(grad.end).toBe(hexToRgba(xenTokens.category.utility.accent, 0))
  })
})
