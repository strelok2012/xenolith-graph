import { describe, it, expect, vi } from 'vitest'
import { Selection } from './selection.js'
import { createNodeId } from './ids.js'

describe('Selection', () => {
  it('starts empty', () => {
    const sel = new Selection()
    expect(sel.size).toBe(0)
    expect(sel.ids()).toEqual([])
    expect(sel.contains(createNodeId())).toBe(false)
  })

  it('select(id, "replace") sets selection to just that id', () => {
    const sel = new Selection()
    const a = createNodeId()
    const b = createNodeId()
    sel.select(a, 'replace')
    sel.select(b, 'replace')
    expect(sel.size).toBe(1)
    expect(sel.contains(a)).toBe(false)
    expect(sel.contains(b)).toBe(true)
  })

  it('select(id, "toggle") adds when absent, removes when present', () => {
    const sel = new Selection()
    const a = createNodeId()
    sel.select(a, 'toggle')
    expect(sel.contains(a)).toBe(true)
    sel.select(a, 'toggle')
    expect(sel.contains(a)).toBe(false)
  })

  it('toggle preserves other selected ids', () => {
    const sel = new Selection()
    const a = createNodeId()
    const b = createNodeId()
    sel.select(a, 'replace')
    sel.select(b, 'toggle')
    expect(sel.size).toBe(2)
    expect(sel.contains(a)).toBe(true)
    expect(sel.contains(b)).toBe(true)
  })

  it('clear empties the selection', () => {
    const sel = new Selection()
    sel.select(createNodeId(), 'replace')
    sel.select(createNodeId(), 'toggle')
    sel.clear()
    expect(sel.size).toBe(0)
  })

  it('emits selection:changed on any mutation', () => {
    const sel = new Selection()
    const handler = vi.fn()
    sel.on(handler)
    sel.select(createNodeId(), 'replace')
    sel.select(createNodeId(), 'toggle')
    sel.clear()
    expect(handler).toHaveBeenCalledTimes(3)
  })

  it('does not emit on a no-op clear (was already empty)', () => {
    const sel = new Selection()
    const handler = vi.fn()
    sel.on(handler)
    sel.clear()
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not emit on a no-op replace (selecting the same id again)', () => {
    const sel = new Selection()
    const a = createNodeId()
    sel.select(a, 'replace')
    const handler = vi.fn()
    sel.on(handler)
    sel.select(a, 'replace')
    expect(handler).not.toHaveBeenCalled()
  })

  it('event payload contains the current set of ids', () => {
    const sel = new Selection()
    const a = createNodeId()
    let lastIds: readonly string[] | undefined
    sel.on((e) => {
      lastIds = e.ids
    })
    sel.select(a, 'replace')
    expect(lastIds).toEqual([a])
  })

  it('replaceWith() sets the selection to exactly the given ids', () => {
    const sel = new Selection()
    const a = createNodeId()
    const b = createNodeId()
    const c = createNodeId()
    sel.select(a, 'replace')
    sel.replaceWith([b, c])
    expect(sel.size).toBe(2)
    expect(sel.contains(a)).toBe(false)
    expect(sel.contains(b)).toBe(true)
    expect(sel.contains(c)).toBe(true)
  })

  it('replaceWith([]) is equivalent to clear()', () => {
    const sel = new Selection()
    sel.select(createNodeId(), 'replace')
    sel.replaceWith([])
    expect(sel.size).toBe(0)
  })

  it('replaceWith() does not emit when the resulting set is identical', () => {
    const sel = new Selection()
    const a = createNodeId()
    const b = createNodeId()
    sel.replaceWith([a, b])
    const handler = vi.fn()
    sel.on(handler)
    sel.replaceWith([a, b])
    expect(handler).not.toHaveBeenCalled()
    sel.replaceWith([b, a]) // same set, different order
    expect(handler).not.toHaveBeenCalled()
  })

  it('off / unsubscribe stops events', () => {
    const sel = new Selection()
    const handler = vi.fn()
    const off = sel.on(handler)
    sel.select(createNodeId(), 'replace')
    off()
    sel.select(createNodeId(), 'replace')
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
