import { describe, it, expect, vi, beforeEach } from 'vitest'
import { svelteEventName } from './index.js'

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
  EDITOR_EVENT_NAMES: ['node:click', 'selection:changed', 'edge:connected'],
}))

const { xenolith } = await import('./index.js')
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('svelteEventName', () => {
  it('kebabs colon event names', () => {
    expect(svelteEventName('node:click')).toBe('node-click')
    expect(svelteEventName('selection:changed')).toBe('selection-changed')
  })
})

describe('xenolith action', () => {
  beforeEach(() => { createEditorBinding.mockClear(); binding.setProps.mockClear(); binding.destroy.mockClear(); handlers.clear() })

  it('mounts a binding on the node with props', async () => {
    const node = document.createElement('div')
    xenolith(node, { minimap: true })
    await flush()
    expect(createEditorBinding).toHaveBeenCalledWith(node, { minimap: true })
  })

  it('re-dispatches editor events as kebab CustomEvents on the node', async () => {
    const node = document.createElement('div')
    xenolith(node)
    await flush()
    const seen: unknown[] = []
    node.addEventListener('node-click', (e) => seen.push((e as CustomEvent).detail))
    handlers.get('node:click')!({ nodeId: 'n1' })
    expect(seen).toEqual([{ nodeId: 'n1' }])
  })

  it('update() forwards to setProps and destroy() tears down', async () => {
    const node = document.createElement('div')
    const action = xenolith(node)
    await flush()
    action.update({ minimap: false })
    expect(binding.setProps).toHaveBeenCalledWith({ minimap: false })
    action.destroy()
    expect(binding.destroy).toHaveBeenCalledTimes(1)
  })
})
