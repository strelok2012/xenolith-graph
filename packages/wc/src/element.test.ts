import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readAttributes } from './attrs.js'

// Mock the WebGL-bound binding so the element can be exercised headlessly in jsdom.
const binding = {
  editor: { id: 'editor' },
  on: vi.fn((_name: string, _h: (d: unknown) => void) => vi.fn()),
  setProps: vi.fn(),
  destroy: vi.fn(),
}
const handlers = new Map<string, (d: unknown) => void>()
const createEditorBinding = vi.fn(async (_target: unknown, _props: unknown) => {
  binding.on.mockImplementation((name: string, h: (d: unknown) => void) => {
    handlers.set(name, h)
    return vi.fn()
  })
  return binding
})
vi.mock('@xenolith/adapter-core', () => ({ createEditorBinding }))

const { register } = await import('./index.js')
register()

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('readAttributes', () => {
  it('parses boolean attributes (present = true, "false" = false, absent = undefined)', () => {
    const el = document.createElement('div')
    expect(readAttributes(el)).toEqual({})
    el.setAttribute('minimap', '')
    el.setAttribute('fit-on-load', 'false')
    expect(readAttributes(el)).toEqual({ minimap: true, fitOnLoad: false })
  })
})

describe('<xenolith-graph> element', () => {
  beforeEach(() => { createEditorBinding.mockClear(); binding.setProps.mockClear(); binding.destroy.mockClear(); handlers.clear() })

  it('mounts a binding with parsed attributes + JS properties on connect', async () => {
    const el = document.createElement('xenolith-graph') as any
    el.setAttribute('minimap', '')
    const graph = { version: 'xenolith.v1' }
    el.graph = graph
    document.body.appendChild(el)
    await flush()
    expect(createEditorBinding).toHaveBeenCalledTimes(1)
    expect(createEditorBinding.mock.calls[0]![1]).toMatchObject({ minimap: true, graph })
    expect(el.editor).toBe(binding.editor)
    el.remove()
  })

  it('re-emits editor events off the element as same-named CustomEvents', async () => {
    const el = document.createElement('xenolith-graph') as any
    document.body.appendChild(el)
    await flush()
    const seen: unknown[] = []
    el.addEventListener('node:click', (e: CustomEvent) => seen.push(e.detail))
    handlers.get('node:click')!({ nodeId: 'n1' })
    expect(seen).toEqual([{ nodeId: 'n1' }])
    el.remove()
  })

  it('applies setProps when a JS property changes after mount', async () => {
    const el = document.createElement('xenolith-graph') as any
    document.body.appendChild(el)
    await flush()
    const g2 = { version: 'xenolith.v1', nodes: [] }
    el.graph = g2
    expect(binding.setProps).toHaveBeenCalledWith(expect.objectContaining({ graph: g2 }))
    el.remove()
  })

  it('destroys the binding on disconnect', async () => {
    const el = document.createElement('xenolith-graph') as any
    document.body.appendChild(el)
    await flush()
    el.remove()
    expect(binding.destroy).toHaveBeenCalledTimes(1)
  })
})
