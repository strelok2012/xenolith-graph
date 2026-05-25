import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { emitName } from './index.js'

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
  EDITOR_EVENT_NAMES: [
    'node:added', 'node:removed', 'node:moved', 'node:click',
    'edge:connected', 'edge:disconnected', 'selection:changed', 'viewport:changed',
    'widget:changed', 'widget:action', 'graph:loaded', 'history:changed',
  ],
}))

const { XenolithGraph } = await import('./index.js')

describe('emitName', () => {
  it('camelCases colon event names', () => {
    expect(emitName('node:click')).toBe('nodeClick')
    expect(emitName('selection:changed')).toBe('selectionChanged')
  })
})

describe('<XenolithGraph> (Vue)', () => {
  beforeEach(() => { createEditorBinding.mockClear(); binding.setProps.mockClear(); binding.destroy.mockClear(); handlers.clear() })

  it('mounts a binding with props', async () => {
    const w = mount(XenolithGraph, { props: { minimap: true } })
    await flushPromises()
    expect(createEditorBinding).toHaveBeenCalledTimes(1)
    expect(createEditorBinding.mock.calls[0]![1]).toMatchObject({ minimap: true })
    w.unmount()
  })

  it('re-emits editor events as camelCased Vue events', async () => {
    const w = mount(XenolithGraph)
    await flushPromises()
    handlers.get('node:click')!({ nodeId: 'n1' })
    expect(w.emitted('nodeClick')).toEqual([[{ nodeId: 'n1' }]])
    w.unmount()
  })

  it('calls setProps when a prop changes', async () => {
    const w = mount(XenolithGraph, { props: { minimap: false } })
    await flushPromises()
    await w.setProps({ minimap: true })
    expect(binding.setProps).toHaveBeenCalledWith(expect.objectContaining({ minimap: true }))
    w.unmount()
  })

  it('destroys the binding on unmount', async () => {
    const w = mount(XenolithGraph)
    await flushPromises()
    w.unmount()
    expect(binding.destroy).toHaveBeenCalledTimes(1)
  })
})
