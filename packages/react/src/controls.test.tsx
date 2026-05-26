import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'

const overlayRoot = document.createElement('div')
const editor = {
  overlayRoot,
  setControls: vi.fn(),
  setMinimapVisible: vi.fn(),
  setMinimapPosition: vi.fn(),
} as any
const binding = { editor, on: vi.fn(() => vi.fn()), setProps: vi.fn(), destroy: vi.fn() }
const createEditorBinding = vi.fn(async () => binding)
vi.mock('@xenolith/adapter-core', () => ({ createEditorBinding }))

const { XenolithGraph, XenolithControls, XenolithMiniMap } = await import('./index.js')
const flush = async (): Promise<void> => { await act(async () => { await Promise.resolve(); await Promise.resolve() }) }

describe('<XenolithControls> (declarative wrapper over core controls)', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('enables the core controls with its props on mount, removes them on unmount', async () => {
    const { unmount } = render(<XenolithGraph><XenolithControls position="top-right" showSave={false} /></XenolithGraph>)
    await flush()
    expect(editor.setControls).toHaveBeenCalledWith({ position: 'top-right', showSave: false })
    act(() => unmount())
    expect(editor.setControls).toHaveBeenLastCalledWith(false)
  })

  it('renders no DOM of its own (the toolbar is core, in overlayRoot)', async () => {
    render(<XenolithGraph><XenolithControls /></XenolithGraph>)
    await flush()
    expect(overlayRoot.querySelector('[data-xeno-panel]')).toBeNull()
    cleanup()
  })
})

describe('<XenolithMiniMap>', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('enables the minimap on mount and disables it on unmount', async () => {
    const { unmount } = render(<XenolithGraph><XenolithMiniMap position="bottom-right" /></XenolithGraph>)
    await flush()
    expect(editor.setMinimapVisible).toHaveBeenCalledWith(true)
    expect(editor.setMinimapPosition).toHaveBeenCalledWith('bottom-right')
    act(() => unmount())
    expect(editor.setMinimapVisible).toHaveBeenLastCalledWith(false)
  })
})
