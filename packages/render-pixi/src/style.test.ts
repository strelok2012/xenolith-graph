import { describe, it, expect } from 'vitest'
import { xenTokens } from '@xenolith/theme-xen'
import { resolveCategoryAccent, resolvePinFill, resolvePinStroke } from './style.js'

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

  it('returns null for the wildcard type (outline-only pin)', () => {
    expect(resolvePinFill('wildcard', xenTokens)).toBeNull()
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
