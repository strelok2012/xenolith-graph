import { describe, it, expect, vi } from 'vitest'
import { PendingCalls, WSCall, WSResult, WSMessage } from '../protocol.js'

describe('protocol schemas', () => {
  it('accepts a valid call message', () => {
    const ok = WSMessage.safeParse({ id: 'x1', kind: 'call', tool: 'add_node', args: { type: 'Box' } })
    expect(ok.success).toBe(true)
  })
  it('accepts a successful result', () => {
    const ok = WSMessage.safeParse({ id: 'x1', kind: 'result', ok: true, data: { id: 'n_1' } })
    expect(ok.success).toBe(true)
  })
  it('accepts a failed result', () => {
    const ok = WSMessage.safeParse({ id: 'x1', kind: 'result', ok: false, error: 'unknown type' })
    expect(ok.success).toBe(true)
  })
  it('rejects a malformed envelope', () => {
    const bad = WSMessage.safeParse({ kind: 'call' })
    expect(bad.success).toBe(false)
  })
})

describe('PendingCalls', () => {
  it('resolves with data when matching result arrives', async () => {
    const sent: WSCall[] = []
    const p = new PendingCalls({ send: (m) => sent.push(m) })
    const promise = p.call('add_node', { type: 'Box' })
    expect(sent).toHaveLength(1)
    expect(sent[0]!.tool).toBe('add_node')
    const handled = p.resolve({ id: sent[0]!.id, kind: 'result', ok: true, data: { id: 'n_1' } })
    expect(handled).toBe(true)
    await expect(promise).resolves.toEqual({ id: 'n_1' })
    expect(p.pendingCount).toBe(0)
  })
  it('rejects with error on failed result', async () => {
    const sent: WSCall[] = []
    const p = new PendingCalls({ send: (m) => sent.push(m) })
    const promise = p.call('add_node')
    p.resolve({ id: sent[0]!.id, kind: 'result', ok: false, error: 'no editor' })
    await expect(promise).rejects.toThrow('no editor')
  })
  it('ignores results with unknown id', () => {
    const p = new PendingCalls({ send: () => {} })
    const handled = p.resolve({ id: 'ghost', kind: 'result', ok: true })
    expect(handled).toBe(false)
  })
  it('times out a stalled call', async () => {
    vi.useFakeTimers()
    const p = new PendingCalls({ send: () => {} }, 100)
    const promise = p.call('add_node')
    vi.advanceTimersByTime(150)
    await expect(promise).rejects.toThrow(/timed out/)
    expect(p.pendingCount).toBe(0)
    vi.useRealTimers()
  })
  it('abortAll rejects every in-flight call', async () => {
    const p = new PendingCalls({ send: () => {} })
    const a = p.call('a'), b = p.call('b')
    p.abortAll('editor disconnected')
    await expect(a).rejects.toThrow('editor disconnected')
    await expect(b).rejects.toThrow('editor disconnected')
    expect(p.pendingCount).toBe(0)
  })
})

describe('result schema variants', () => {
  it('parses successful result without data', () => {
    const r: WSResult = { id: 'x', kind: 'result', ok: true }
    expect(WSResult.safeParse(r).success).toBe(true)
  })
})
