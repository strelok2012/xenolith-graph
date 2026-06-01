import { z } from 'zod'

/** Wire protocol between the MCP server (Node) and the editor (browser) over WebSocket.
 *  All messages are JSON envelopes with a correlation `id`. The server initiates `call`;
 *  the editor replies with one `result` carrying ok/data or ok=false/error. */

export const WSCall = z.object({
  id: z.string(),
  kind: z.literal('call'),
  tool: z.string(),
  args: z.unknown().optional(),
})
export type WSCall = z.infer<typeof WSCall>

export const WSResult = z.discriminatedUnion('ok', [
  z.object({ id: z.string(), kind: z.literal('result'), ok: z.literal(true), data: z.unknown().optional() }),
  z.object({ id: z.string(), kind: z.literal('result'), ok: z.literal(false), error: z.string() }),
])
export type WSResult = z.infer<typeof WSResult>

export const WSHello = z.object({
  kind: z.literal('hello'),
  editorVersion: z.string().optional(),
})
export type WSHello = z.infer<typeof WSHello>

export const WSMessage = z.union([WSCall, WSResult, WSHello])
export type WSMessage = z.infer<typeof WSMessage>

export interface CallSink {
  send(msg: WSCall): void
}

/** Tracks in-flight `call` ids and resolves them when the matching `result` arrives.
 *  Times out after `timeoutMs` so a dead editor doesn't hang the MCP server. */
export class PendingCalls {
  #counter = 0
  #pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>()

  constructor(private readonly sink: CallSink, private readonly defaultTimeoutMs = 5000) {}

  call(tool: string, args?: unknown, timeoutMs = this.defaultTimeoutMs): Promise<unknown> {
    const id = `c${++this.#counter}`
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(new Error(`mcp tool '${tool}' timed out after ${timeoutMs}ms (is the editor connected?)`))
      }, timeoutMs)
      this.#pending.set(id, { resolve, reject, timer })
      this.sink.send({ id, kind: 'call', tool, args })
    })
  }

  /** Match an incoming result to a pending call. Returns true if it was handled. */
  resolve(msg: WSResult): boolean {
    const entry = this.#pending.get(msg.id)
    if (!entry) return false
    clearTimeout(entry.timer)
    this.#pending.delete(msg.id)
    if (msg.ok) entry.resolve(msg.data)
    else entry.reject(new Error(msg.error))
    return true
  }

  /** Reject every in-flight call (e.g. when the editor disconnects). */
  abortAll(reason: string): void {
    for (const [, entry] of this.#pending) { clearTimeout(entry.timer); entry.reject(new Error(reason)) }
    this.#pending.clear()
  }

  get pendingCount(): number { return this.#pending.size }
}
