import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoot, createSignal } from 'solid-js'

const { handlers, binding, createEditorBinding } = vi.hoisted(() => {
  const handlers = new Map<string, (d: unknown) => void>()
  const binding = {
    editor: { id: 'editor' } as any,
    on: vi.fn((name: string, h: (d: unknown) => void) => { handlers.set(name, h); return vi.fn() }),
    setProps: vi.fn(),
    destroy: vi.fn(),
  }
  const createEditorBinding = vi.fn(async (_t: unknown, _p?: unknown) => binding)
  return { handlers, binding, createEditorBinding }
})
vi.mock('@xenolith/adapter-core', () => ({
  createEditorBinding,
  EDITOR_EVENT_NAMES: ['node:click', 'selection:changed'],
}))

const { xenolith } = await import('./index.js')
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('xenolith directive (Solid)', () => {
  beforeEach(() => { createEditorBinding.mockClear(); binding.setProps.mockClear(); binding.destroy.mockClear(); handlers.clear() })

  it('mounts a binding and re-dispatches events as colon CustomEvents', async () => {
    const el = document.createElement('div')
    const seen: unknown[] = []
    el.addEventListener('node:click', (e) => seen.push((e as CustomEvent).detail))
    const dispose = createRoot((d) => { xenolith(el, () => ({ minimap: true })); return d })
    await flush()
    expect(createEditorBinding).toHaveBeenCalledWith(el, { minimap: true })
    handlers.get('node:click')!({ nodeId: 'n1' })
    expect(seen).toEqual([{ nodeId: 'n1' }])
    dispose()
  })

  it('applies the bound props on mount and destroys on dispose', async () => {
    const el = document.createElement('div')
    const [props] = createSignal({ minimap: true })
    const dispose = createRoot((d) => { xenolith(el, props); return d })
    await flush()
    expect(binding.setProps).toHaveBeenCalledWith({ minimap: true })
    dispose()
    expect(binding.destroy).toHaveBeenCalledTimes(1)
  })
})
