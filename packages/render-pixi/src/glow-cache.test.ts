// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Renderer } from 'pixi.js'
import { makeGlowLayer, clearGlowTextureCache } from './node-renderer.js'

// Stub Renderer — only the surface makeGlowLayer/bakeGlowTexture actually touches: `render({...})`
// and `resolution`. The fix invariant verified here: a cache-MISS call to `makeGlowLayer` MUST
// NOT call `renderer.render` synchronously. PIXI v8's FilterSystem races on a nested render()
// during the editor's own frame and throws "Cannot read properties of null (reading '2')" on
// BindGroup.setResource — that crash aborts edge drawing for the whole frame (visible after
// template-dive on a fresh definition: nodes appear, edges don't).
function stubRenderer(): { renderer: Renderer; render: ReturnType<typeof vi.fn> } {
  const render = vi.fn()
  const renderer = { render, resolution: 1, generateTexture: vi.fn() } as unknown as Renderer
  return { renderer, render }
}

const STYLE = { glow: '#FCB400', glowBlur: 10, glowWidth: 3 } as const

describe('glow-cache crash fix (bake deferred to microtask)', () => {
  beforeEach(() => { clearGlowTextureCache() })

  it('makeGlowLayer does NOT call renderer.render synchronously on first paint (cache miss)', () => {
    const { renderer, render } = stubRenderer()
    makeGlowLayer(STYLE, 160, 64, 8, renderer)
    expect(render).not.toHaveBeenCalled()
  })

  it('30 fresh-size makeGlowLayer calls in a row stay sync-render-free (template-dive scenario)', () => {
    const { renderer, render } = stubRenderer()
    for (let i = 0; i < 30; i++) makeGlowLayer(STYLE, 120 + i * 4, 60, 8, renderer)
    expect(render).not.toHaveBeenCalled()
  })

  it('cache fills at microtask boundary (so the next frame uses the cheap sprite path)', async () => {
    const { renderer, render } = stubRenderer()
    makeGlowLayer(STYLE, 160, 64, 8, renderer)
    expect(render).not.toHaveBeenCalled()
    await Promise.resolve()                                // flush queueMicrotask
    expect(render.mock.calls.length).toBeGreaterThan(0)    // bake ran out-of-band
  })

  it('a bake failure does not poison the cache (next miss safely retries)', async () => {
    const { renderer } = stubRenderer()
    ;(renderer.render as ReturnType<typeof vi.fn>).mockImplementationOnce(() => { throw new Error('simulated') })
    makeGlowLayer(STYLE, 160, 64, 8, renderer)
    await Promise.resolve()
    // Second call on the same signature must still be sync-safe AND queue another bake.
    expect(() => makeGlowLayer(STYLE, 160, 64, 8, renderer)).not.toThrow()
    await Promise.resolve()
    expect((renderer.render as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1)
  })

})
