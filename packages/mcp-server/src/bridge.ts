import { WebSocketServer, WebSocket } from 'ws'
import { IncomingMessage } from 'node:http'
import { PendingCalls, WSCall, WSMessage } from './protocol.js'

/** A single editor connection — owns a WebSocket and its in-flight call ledger. */
export class EditorConnection {
  readonly pending: PendingCalls
  constructor(public readonly id: string, private readonly ws: WebSocket, defaultTimeoutMs: number) {
    this.pending = new PendingCalls({ send: (m: WSCall) => this.ws.send(JSON.stringify(m)) }, defaultTimeoutMs)
  }
  call(tool: string, args?: unknown, timeoutMs?: number): Promise<unknown> {
    return this.pending.call(tool, args, timeoutMs)
  }
  close(reason: string): void {
    this.pending.abortAll(reason)
    try { this.ws.close() } catch { /* noop */ }
  }
}

export interface BridgeOptions {
  port?: number
  /** When set, incoming connections must include `?token=...` matching this value. */
  token?: string
  /** Default per-call timeout in ms. */
  callTimeoutMs?: number
  /** Optional log sink (defaults to stderr — never stdout, that's reserved for MCP stdio). */
  log?: (msg: string) => void
}

/** WebSocket hub: accepts editor connections, exposes `current()` for tool handlers. */
export class EditorBridge {
  #wss: WebSocketServer | null = null
  #connections = new Map<string, EditorConnection>()
  #current: EditorConnection | null = null
  #counter = 0
  readonly opts: {
    port: number
    callTimeoutMs: number
    token?: string
    log: (msg: string) => void
  }

  constructor(opts: BridgeOptions = {}) {
    this.opts = {
      port: opts.port ?? 7777,
      callTimeoutMs: opts.callTimeoutMs ?? 5000,
      log: opts.log ?? ((m) => process.stderr.write(`[xenolith-mcp] ${m}\n`)),
      ...(opts.token !== undefined ? { token: opts.token } : {}),
    }
  }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ port: this.opts.port, host: '127.0.0.1' })
      wss.on('error', reject)
      wss.on('listening', () => {
        const addr = wss.address()
        const port = typeof addr === 'object' && addr ? addr.port : this.opts.port
        this.opts.log(`bridge listening on ws://127.0.0.1:${port}`)
        resolve(port)
      })
      wss.on('connection', (ws, req) => this.#onConnect(ws, req))
      this.#wss = wss
    })
  }

  #onConnect(ws: WebSocket, req: IncomingMessage): void {
    if (this.opts.token) {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (url.searchParams.get('token') !== this.opts.token) {
        this.opts.log('rejected connection: bad/missing token')
        ws.close(1008, 'bad token')
        return
      }
    }
    const id = `e${++this.#counter}`
    const conn = new EditorConnection(id, ws, this.opts.callTimeoutMs)
    this.#connections.set(id, conn)
    this.#current = conn
    this.opts.log!(`editor connected (${id}); ${this.#connections.size} total`)
    ws.on('message', (raw) => this.#onMessage(conn, raw.toString()))
    ws.on('close', () => {
      this.#connections.delete(id)
      conn.close('socket closed')
      if (this.#current === conn) this.#current = [...this.#connections.values()].pop() ?? null
      this.opts.log(`editor disconnected (${id}); ${this.#connections.size} remain`)
    })
    ws.on('error', (err) => this.opts.log!(`socket error (${id}): ${err.message}`))
  }

  #onMessage(conn: EditorConnection, raw: string): void {
    let parsed: unknown
    try { parsed = JSON.parse(raw) } catch { this.opts.log!(`malformed json from ${conn.id}`); return }
    const msg = parseMessage(parsed)
    if (!msg) { this.opts.log!(`unknown message shape from ${conn.id}`); return }
    if (msg.kind === 'result') conn.pending.resolve(msg)
    else if (msg.kind === 'hello') this.opts.log!(`hello from ${conn.id} (editor ${msg.editorVersion ?? '?'})`)
    // editor never sends 'call' in scenario A — server is the caller.
  }

  /** Return the currently-active editor connection, or throw if none is connected. */
  current(): EditorConnection {
    if (!this.#current) throw new Error('no editor connected — open the playground and call editor.connectMCP() first')
    return this.#current
  }

  hasEditor(): boolean { return this.#current !== null }

  async stop(): Promise<void> {
    for (const c of this.#connections.values()) c.close('server stopping')
    this.#connections.clear()
    this.#current = null
    await new Promise<void>((res) => { this.#wss ? this.#wss.close(() => res()) : res() })
    this.#wss = null
  }
}

function parseMessage(parsed: unknown): WSMessage | null {
  const r = WSMessage.safeParse(parsed)
  return r.success ? r.data : null
}
