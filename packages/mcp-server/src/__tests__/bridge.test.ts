import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { WebSocket } from 'ws'
import { EditorBridge } from '../bridge.js'

describe('EditorBridge over a real WebSocket', () => {
  let bridge: EditorBridge
  let port: number

  beforeEach(async () => {
    bridge = new EditorBridge({ port: 0, token: 'secret', log: () => {} })
    port = await bridge.start()
  })
  afterEach(async () => { await bridge.stop() })

  function open(token = 'secret'): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}?token=${token}`)
      ws.on('open', () => resolve(ws))
      ws.on('error', reject)
    })
  }

  it('rejects connections with a bad token (server closes with 1008)', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}?token=wrong`)
    const closeCode = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code))
      ws.on('error', () => {}) // swallow — close is what we expect
    })
    expect(closeCode).toBe(1008)
    expect(bridge.hasEditor()).toBe(false)
  })

  it('round-trips a call → result with the connected editor', async () => {
    const ws = await open()
    await new Promise((r) => setTimeout(r, 20))
    expect(bridge.hasEditor()).toBe(true)

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString())
      if (msg.kind === 'call' && msg.tool === 'add_node') {
        ws.send(JSON.stringify({ id: msg.id, kind: 'result', ok: true, data: { id: 'n_42' } }))
      }
    })

    const result = await bridge.current().call('add_node', { type: 'Box', x: 0, y: 0 })
    expect(result).toEqual({ id: 'n_42' })
    ws.close()
  })

  it('throws when no editor is connected', () => {
    expect(() => bridge.current()).toThrow(/no editor/)
  })

  it('aborts pending calls when the editor disconnects', async () => {
    const ws = await open()
    await new Promise((r) => setTimeout(r, 20))
    const pending = bridge.current().call('add_node', {}, 5000)
    ws.close()
    await expect(pending).rejects.toThrow(/disconnect|closed/i)
  })
})
