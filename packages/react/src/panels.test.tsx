import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'

const overlayRoot = document.createElement('div')
const editor = { id: 'editor', overlayRoot } as any
const binding = {
  editor,
  on: vi.fn(() => vi.fn()),
  setProps: vi.fn(),
  destroy: vi.fn(),
}
const createEditorBinding = vi.fn(async () => binding)
vi.mock('@xenolith/adapter-core', () => ({ createEditorBinding }))

const { XenolithGraph, XenolithPanel, XenolithButton, useXenolithEditor } = await import('./index.js')

const flush = async (): Promise<void> => { await act(async () => { await Promise.resolve(); await Promise.resolve() }) }

describe('<XenolithPanel>', () => {
  beforeEach(() => { overlayRoot.replaceChildren() })

  it('portals its children into editor.overlayRoot once ready', async () => {
    render(
      <XenolithGraph>
        <XenolithPanel position="top-right">
          <button type="button">Fit</button>
        </XenolithPanel>
      </XenolithGraph>,
    )
    await flush()
    expect(overlayRoot.textContent).toContain('Fit')
    // anchored container opts back into pointer events
    const panel = overlayRoot.querySelector('[data-xeno-panel]') as HTMLElement
    expect(panel).toBeTruthy()
    expect(panel.style.pointerEvents).toBe('auto')
    expect(panel.style.right).not.toBe('')
    expect(panel.style.top).not.toBe('')
    cleanup()
  })

  it('renders nothing before the editor is ready', async () => {
    render(<XenolithGraph><XenolithPanel><span>late</span></XenolithPanel></XenolithGraph>)
    // not flushed yet → editor null → no portal
    expect(overlayRoot.textContent).toBe('')
    await flush()
    expect(overlayRoot.textContent).toContain('late')
    cleanup()
  })
})

describe('useXenolithEditor', () => {
  it('exposes the live editor to descendants', async () => {
    let seen: unknown = 'unset'
    function Probe(): null { seen = useXenolithEditor(); return null }
    render(<XenolithGraph><Probe /></XenolithGraph>)
    await flush()
    expect(seen).toBe(editor)
    cleanup()
  })
})

describe('<XenolithButton>', () => {
  it('renders a button wired to onClick', async () => {
    const onClick = vi.fn()
    render(
      <XenolithGraph>
        <XenolithPanel><XenolithButton onClick={onClick}>Reset</XenolithButton></XenolithPanel>
      </XenolithGraph>,
    )
    await flush()
    const btn = overlayRoot.querySelector('button') as HTMLButtonElement
    expect(btn.textContent).toBe('Reset')
    act(() => btn.click())
    expect(onClick).toHaveBeenCalled()
    cleanup()
  })
})
