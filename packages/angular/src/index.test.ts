import { describe, it, expect, vi, beforeEach } from 'vitest'
import { angularOutputName } from './index.js'

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

const { XenolithGraphComponent } = await import('./index.js')

describe('angularOutputName', () => {
  it('camelCases colon event names', () => {
    expect(angularOutputName('node:click')).toBe('nodeClick')
    expect(angularOutputName('selection:changed')).toBe('selectionChanged')
  })
})

// The component is exercised without TestBed: instantiate the class, supply a host element, and
// drive its lifecycle hooks directly. EventEmitter works standalone (it's an RxJS Subject).
describe('XenolithGraphComponent (Angular)', () => {
  beforeEach(() => { createEditorBinding.mockClear(); binding.setProps.mockClear(); binding.destroy.mockClear(); handlers.clear() })

  function make() {
    const c = new XenolithGraphComponent()
    c.host = { nativeElement: document.createElement('div') } as any
    return c
  }

  it('mounts on ngAfterViewInit and emits ready with the editor', async () => {
    const c = make()
    c.minimap = true
    const ready: unknown[] = []
    c.ready.subscribe((e) => ready.push(e))
    await c.ngAfterViewInit()
    expect(createEditorBinding.mock.calls[0]![1]).toMatchObject({ minimap: true })
    expect(ready).toEqual([binding.editor])
  })

  it('routes editor events to the matching @Output emitter', async () => {
    const c = make()
    const seen: unknown[] = []
    c.nodeClick.subscribe((e) => seen.push(e))
    await c.ngAfterViewInit()
    handlers.get('node:click')!({ nodeId: 'n1' })
    expect(seen).toEqual([{ nodeId: 'n1' }])
  })

  it('setProps on ngOnChanges and destroy on ngOnDestroy', async () => {
    const c = make()
    await c.ngAfterViewInit()
    c.minimap = true
    c.ngOnChanges()
    expect(binding.setProps).toHaveBeenCalledWith(expect.objectContaining({ minimap: true }))
    c.ngOnDestroy()
    expect(binding.destroy).toHaveBeenCalledTimes(1)
  })
})
