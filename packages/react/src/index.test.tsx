import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import { EVENT_PROP } from './events-map.js'

const handlers = new Map<string, (d: unknown) => void>()
const binding = {
  editor: { id: 'editor' } as any,
  on: vi.fn((name: string, h: (d: unknown) => void) => { handlers.set(name, h); return vi.fn() }),
  setProps: vi.fn(),
  destroy: vi.fn(),
}
const createEditorBinding = vi.fn(async (_target: unknown, _props?: unknown) => binding)
vi.mock('@xenolith/adapter-core', () => ({ createEditorBinding }))

const { XenolithGraph } = await import('./index.js')

const flush = async (): Promise<void> => { await act(async () => { await Promise.resolve(); await Promise.resolve() }) }

describe('EVENT_PROP', () => {
  it('maps every event to a distinct on*-prefixed callback name', () => {
    const names = Object.values(EVENT_PROP)
    expect(names.every((n) => n.startsWith('on'))).toBe(true)
    expect(new Set(names).size).toBe(names.length)
    expect(EVENT_PROP['node:click']).toBe('onNodeClick')
    expect(EVENT_PROP['selection:changed']).toBe('onSelectionChange')
  })
})

describe('<XenolithGraph>', () => {
  beforeEach(() => { createEditorBinding.mockClear(); binding.setProps.mockClear(); binding.destroy.mockClear(); handlers.clear() })

  it('mounts a binding and reports the editor via onReady', async () => {
    const onReady = vi.fn()
    render(<XenolithGraph minimap onReady={onReady} />)
    await flush()
    expect(createEditorBinding).toHaveBeenCalledTimes(1)
    expect(createEditorBinding.mock.calls[0]![1]).toMatchObject({ minimap: true })
    expect(onReady).toHaveBeenCalledWith(binding.editor)
    cleanup()
  })

  it('routes editor events to the matching React callback prop', async () => {
    const onNodeClick = vi.fn()
    render(<XenolithGraph onNodeClick={onNodeClick} />)
    await flush()
    handlers.get('node:click')!({ nodeId: 'n1' })
    expect(onNodeClick).toHaveBeenCalledWith({ nodeId: 'n1' })
    cleanup()
  })

  it('destroys the binding on unmount', async () => {
    render(<XenolithGraph />)
    await flush()
    cleanup()
    expect(binding.destroy).toHaveBeenCalledTimes(1)
  })
})
