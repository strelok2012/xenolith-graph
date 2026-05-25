import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'

const overlayRoot = document.createElement('div')
Object.defineProperty(overlayRoot, 'clientWidth', { value: 800, configurable: true })
Object.defineProperty(overlayRoot, 'clientHeight', { value: 600, configurable: true })
type Handler = (p: any) => void
const listeners = new Map<string, Set<Handler>>()
const editor = {
  overlayRoot,
  viewport: { zoom: 1 },
  fitView: vi.fn(),
  resetView: vi.fn(),
  zoomAt: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  on: (ev: string, h: Handler) => {
    let s = listeners.get(ev); if (!s) listeners.set(ev, (s = new Set()))
    s.add(h); return () => s!.delete(h)
  },
  setMinimapVisible: vi.fn(),
  setMinimapPosition: vi.fn(),
} as any
const emit = (ev: string, p?: any): void => { act(() => { listeners.get(ev)?.forEach((h) => h(p)) }) }
const binding = { editor, on: vi.fn(() => vi.fn()), setProps: vi.fn(), destroy: vi.fn() }
const createEditorBinding = vi.fn(async () => binding)
vi.mock('@xenolith/adapter-core', () => ({ createEditorBinding }))

const { XenolithGraph, XenolithControls, XenolithMiniMap } = await import('./index.js')

const flush = async (): Promise<void> => { await act(async () => { await Promise.resolve(); await Promise.resolve() }) }
const click = (label: string): void => {
  const btn = [...overlayRoot.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent) === label) as HTMLButtonElement
  act(() => btn.click())
}

const findBtn = (label: string): HTMLButtonElement =>
  [...overlayRoot.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label) as HTMLButtonElement

describe('<XenolithControls>', () => {
  beforeEach(() => { overlayRoot.replaceChildren(); listeners.clear(); vi.clearAllMocks(); editor.viewport.zoom = 1 })

  it('fits, resets and zooms via the editor API', async () => {
    render(<XenolithGraph><XenolithControls /></XenolithGraph>)
    await flush()
    click('Fit view'); expect(editor.fitView).toHaveBeenCalled()
    click('Reset view'); expect(editor.resetView).toHaveBeenCalled()
    // zoom in/out call zoomAt with a focal at the editor centre and a relative factor
    click('Zoom in')
    expect(editor.zoomAt).toHaveBeenCalledWith({ x: 400, y: 300 }, expect.any(Number))
    const factorIn = editor.zoomAt.mock.calls.at(-1)![1]
    expect(factorIn).toBeGreaterThan(1)
    click('Zoom out')
    expect(editor.zoomAt.mock.calls.at(-1)![1]).toBeLessThan(1)
    cleanup()
  })

  it('disables undo/redo until history:changed reports a non-empty stack', async () => {
    render(<XenolithGraph><XenolithControls /></XenolithGraph>)
    await flush()
    // fresh editor: both stacks empty → disabled
    expect(findBtn('Undo').disabled).toBe(true)
    expect(findBtn('Redo').disabled).toBe(true)

    emit('history:changed', { canUndo: true, canRedo: false })
    expect(findBtn('Undo').disabled).toBe(false)
    expect(findBtn('Redo').disabled).toBe(true)

    click('Undo'); expect(editor.undo).toHaveBeenCalled()

    emit('history:changed', { canUndo: false, canRedo: true })
    expect(findBtn('Redo').disabled).toBe(false)
    click('Redo'); expect(editor.redo).toHaveBeenCalled()
    cleanup()
  })
})

describe('<XenolithMiniMap>', () => {
  beforeEach(() => { overlayRoot.replaceChildren(); vi.clearAllMocks() })

  it('enables the minimap on mount and disables it on unmount', async () => {
    const { unmount } = render(<XenolithGraph><XenolithMiniMap position="bottom-right" /></XenolithGraph>)
    await flush()
    expect(editor.setMinimapVisible).toHaveBeenCalledWith(true)
    expect(editor.setMinimapPosition).toHaveBeenCalledWith('bottom-right')
    act(() => unmount())
    expect(editor.setMinimapVisible).toHaveBeenLastCalledWith(false)
  })
})
