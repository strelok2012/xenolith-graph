import type { EventEmitter } from './event-emitter.js'
import type { Graph } from './graph.js'

export interface CommandContext {
  graph: Graph
  events: EventEmitter<CoreEvents>
}

export interface Command<T = unknown> {
  readonly type: string
  apply(ctx: CommandContext): T
  undo(ctx: CommandContext, applied: T): void
}

export type CoreEvents = {
  'command:applied':       { command: Command<unknown>; result: unknown }
  'command:undone':        { command: Command<unknown> }
  'command:redone':        { command: Command<unknown> }
  'transaction:committed': { commands: Command<unknown>[] }
  'transaction:reverted':  { commands: Command<unknown>[] }
}

interface AppliedCommand {
  command: Command<unknown>
  result: unknown
}

type LogEntry =
  | { kind: 'single'; entry: AppliedCommand }
  | { kind: 'tx'; entries: AppliedCommand[] }

export interface CommandBusOptions {
  /** Maximum number of undo entries to retain. Older entries are dropped when exceeded. */
  maxHistory?: number
}

export class CommandBus {
  readonly #ctx: CommandContext
  readonly #maxHistory: number
  readonly #log: LogEntry[] = []
  #cursor = 0
  #txBuffer: AppliedCommand[] | null = null

  constructor(ctx: CommandContext, opts: CommandBusOptions = {}) {
    this.#ctx = ctx
    this.#maxHistory = opts.maxHistory ?? Number.POSITIVE_INFINITY
  }

  apply<T>(command: Command<T>): T {
    const result = command.apply(this.#ctx)
    const applied: AppliedCommand = { command: command as Command<unknown>, result }
    if (this.#txBuffer) {
      this.#txBuffer.push(applied)
    } else {
      this.#truncateRedo()
      this.#log.push({ kind: 'single', entry: applied })
      this.#cursor++
      this.#enforceHistoryBound()
    }
    this.#ctx.events.emit('command:applied', { command: applied.command, result })
    return result
  }

  undo(): boolean {
    if (!this.canUndo()) return false
    this.#cursor--
    const entry = this.#log[this.#cursor]!
    if (entry.kind === 'single') {
      this.#undoOne(entry.entry)
    } else {
      for (let i = entry.entries.length - 1; i >= 0; i--) {
        this.#undoOne(entry.entries[i]!)
      }
    }
    return true
  }

  redo(): boolean {
    if (!this.canRedo()) return false
    const entry = this.#log[this.#cursor]!
    // Advance the cursor before re-applying so listeners observing command:redone read a consistent
    // canUndo/canRedo (mirrors undo(), which decrements first). #redoOne doesn't depend on the cursor.
    this.#cursor++
    if (entry.kind === 'single') {
      this.#redoOne(entry.entry)
    } else {
      for (const e of entry.entries) this.#redoOne(e)
    }
    return true
  }

  canUndo(): boolean { return this.#cursor > 0 }
  canRedo(): boolean { return this.#cursor < this.#log.length }

  transaction<R>(fn: () => R): R {
    if (this.#txBuffer) {
      throw new Error('CommandBus: nested transactions are not supported')
    }
    const buffer: AppliedCommand[] = []
    this.#txBuffer = buffer
    try {
      const result = fn()
      this.#txBuffer = null
      if (buffer.length === 0) return result
      this.#truncateRedo()
      this.#log.push({ kind: 'tx', entries: buffer })
      this.#cursor++
      this.#enforceHistoryBound()
      this.#ctx.events.emit('transaction:committed', { commands: buffer.map((e) => e.command) })
      return result
    } catch (err) {
      this.#txBuffer = null
      for (let i = buffer.length - 1; i >= 0; i--) {
        try {
          this.#undoOne(buffer[i]!)
        } catch {
          // continue rollback even if a single undo throws
        }
      }
      this.#ctx.events.emit('transaction:reverted', { commands: buffer.map((e) => e.command) })
      throw err
    }
  }

  clearHistory(): void {
    this.#log.length = 0
    this.#cursor = 0
  }

  #truncateRedo(): void {
    if (this.#cursor < this.#log.length) {
      this.#log.length = this.#cursor
    }
  }

  #enforceHistoryBound(): void {
    while (this.#log.length > this.#maxHistory) {
      this.#log.shift()
      this.#cursor--
    }
  }

  #undoOne(applied: AppliedCommand): void {
    applied.command.undo(this.#ctx, applied.result)
    this.#ctx.events.emit('command:undone', { command: applied.command })
  }

  #redoOne(applied: AppliedCommand): void {
    applied.result = applied.command.apply(this.#ctx)
    this.#ctx.events.emit('command:redone', { command: applied.command })
  }
}
