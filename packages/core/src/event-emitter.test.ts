import { describe, it, expect, vi } from 'vitest'
import { EventEmitter } from './event-emitter.js'

type AppEvents = {
  'node:added': { id: string }
  'edge:removed': { id: string; reason: 'user' | 'cascade' }
}

describe('EventEmitter', () => {
  it('delivers an event to a subscriber registered with on()', () => {
    const bus = new EventEmitter<AppEvents>()
    const handler = vi.fn()
    bus.on('node:added', handler)
    bus.emit('node:added', { id: 'n1' })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ id: 'n1' })
  })

  it('delivers to multiple subscribers in registration order', () => {
    const bus = new EventEmitter<AppEvents>()
    const calls: number[] = []
    bus.on('node:added', () => calls.push(1))
    bus.on('node:added', () => calls.push(2))
    bus.on('node:added', () => calls.push(3))
    bus.emit('node:added', { id: 'x' })
    expect(calls).toEqual([1, 2, 3])
  })

  it('stops delivering after off()', () => {
    const bus = new EventEmitter<AppEvents>()
    const handler = vi.fn()
    bus.on('node:added', handler)
    bus.off('node:added', handler)
    bus.emit('node:added', { id: 'n1' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('on() returns an unsubscribe function as a shortcut for off()', () => {
    const bus = new EventEmitter<AppEvents>()
    const handler = vi.fn()
    const unsubscribe = bus.on('node:added', handler)
    unsubscribe()
    bus.emit('node:added', { id: 'n1' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('once() delivers exactly one event then auto-unsubscribes', () => {
    const bus = new EventEmitter<AppEvents>()
    const handler = vi.fn()
    bus.once('node:added', handler)
    bus.emit('node:added', { id: 'a' })
    bus.emit('node:added', { id: 'b' })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ id: 'a' })
  })

  it('isolates events by name', () => {
    const bus = new EventEmitter<AppEvents>()
    const node = vi.fn()
    const edge = vi.fn()
    bus.on('node:added', node)
    bus.on('edge:removed', edge)
    bus.emit('node:added', { id: 'n1' })
    expect(node).toHaveBeenCalledTimes(1)
    expect(edge).not.toHaveBeenCalled()
  })

  it('continues delivery when an earlier listener throws', () => {
    const bus = new EventEmitter<AppEvents>()
    const second = vi.fn()
    const onError = vi.fn()
    bus.onError(onError)
    bus.on('node:added', () => {
      throw new Error('boom')
    })
    bus.on('node:added', second)
    bus.emit('node:added', { id: 'n1' })
    expect(second).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error)
  })

  it('clear() removes all listeners for a single event', () => {
    const bus = new EventEmitter<AppEvents>()
    const a = vi.fn()
    const b = vi.fn()
    bus.on('node:added', a)
    bus.on('node:added', b)
    bus.clear('node:added')
    bus.emit('node:added', { id: 'n' })
    expect(a).not.toHaveBeenCalled()
    expect(b).not.toHaveBeenCalled()
  })

  it('clear() with no argument removes listeners for all events', () => {
    const bus = new EventEmitter<AppEvents>()
    const node = vi.fn()
    const edge = vi.fn()
    bus.on('node:added', node)
    bus.on('edge:removed', edge)
    bus.clear()
    bus.emit('node:added', { id: 'n' })
    bus.emit('edge:removed', { id: 'e', reason: 'user' })
    expect(node).not.toHaveBeenCalled()
    expect(edge).not.toHaveBeenCalled()
  })

  it('listenerCount() reports the number of subscribers for an event', () => {
    const bus = new EventEmitter<AppEvents>()
    expect(bus.listenerCount('node:added')).toBe(0)
    bus.on('node:added', () => {})
    bus.on('node:added', () => {})
    expect(bus.listenerCount('node:added')).toBe(2)
  })

  it('does not invoke a listener registered during emit for the same event', () => {
    const bus = new EventEmitter<AppEvents>()
    const lateHandler = vi.fn()
    bus.on('node:added', () => {
      bus.on('node:added', lateHandler)
    })
    bus.emit('node:added', { id: 'n' })
    expect(lateHandler).not.toHaveBeenCalled()
  })

  it('handles a listener that unsubscribes itself during emit', () => {
    const bus = new EventEmitter<AppEvents>()
    const calls: string[] = []
    const selfUnsub = () => {
      calls.push('self')
      bus.off('node:added', selfUnsub)
    }
    bus.on('node:added', selfUnsub)
    bus.on('node:added', () => calls.push('other'))
    bus.emit('node:added', { id: 'n' })
    bus.emit('node:added', { id: 'n2' })
    expect(calls).toEqual(['self', 'other', 'other'])
  })
})
