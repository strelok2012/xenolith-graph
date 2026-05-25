import { describe, it, expect, vi } from 'vitest'
import { applyProps, type EditorLike, type XenolithProps } from './props.js'

function mockEditor(): EditorLike & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    setTheme: vi.fn(() => calls.push('setTheme')),
    loadJSON: vi.fn(() => calls.push('loadJSON')),
    fitView: vi.fn(() => calls.push('fitView')),
    setMinimapVisible: vi.fn((v: boolean) => calls.push(`minimap:${v}`)),
    setMinimapPosition: vi.fn(() => calls.push('minimapPos')),
  }
}

describe('applyProps', () => {
  it('calls setTheme only when the theme reference changes', () => {
    const ed = mockEditor()
    const t1 = {} as XenolithProps['theme']
    applyProps(ed, { theme: t1 }, { theme: t1 })
    expect(ed.setTheme).not.toHaveBeenCalled()

    const t2 = {} as XenolithProps['theme']
    applyProps(ed, { theme: t1 }, { theme: t2 })
    expect(ed.setTheme).toHaveBeenCalledWith(t2)
  })

  it('reloads the graph when its reference changes, and frames it when fitOnLoad', () => {
    const ed = mockEditor()
    const g1 = { version: 'xenolith.v1' }
    applyProps(ed, {}, { graph: g1, fitOnLoad: true })
    expect(ed.loadJSON).toHaveBeenCalledWith(g1)
    expect(ed.calls).toEqual(['loadJSON', 'fitView'])

    // Same reference → no reload.
    ed.calls.length = 0
    applyProps(ed, { graph: g1 }, { graph: g1, fitOnLoad: true })
    expect(ed.calls).toEqual([])
  })

  it('does not fitView when fitOnLoad is falsy', () => {
    const ed = mockEditor()
    applyProps(ed, {}, { graph: { version: 'xenolith.v1' } })
    expect(ed.fitView).not.toHaveBeenCalled()
  })

  it('toggles minimap visibility when the flag changes', () => {
    const ed = mockEditor()
    applyProps(ed, { minimap: false }, { minimap: true })
    expect(ed.setMinimapVisible).toHaveBeenCalledWith(true)

    ed.calls.length = 0
    applyProps(ed, { minimap: true }, { minimap: true })
    expect(ed.calls).toEqual([])
  })

  it('updates minimap position when an object position changes', () => {
    const ed = mockEditor()
    applyProps(ed, { minimap: { position: 'top-left' } }, { minimap: { position: 'top-right' } })
    expect(ed.setMinimapPosition).toHaveBeenCalledWith('top-right')
  })
})
