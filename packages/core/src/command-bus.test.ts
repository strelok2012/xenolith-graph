import { describe, it, expect, vi, beforeEach } from 'vitest'
import { CommandBus } from './command-bus.js'
import type { Command, CommandContext, CoreEvents } from './command-bus.js'
import { EventEmitter } from './event-emitter.js'
import { Graph } from './graph.js'

interface OpRecord {
  applied: string[]
  undone: string[]
}

function makeOpCmd(name: string, ops: OpRecord): Command<{ name: string }> {
  return {
    type: name,
    apply: () => {
      ops.applied.push(name)
      return { name }
    },
    undo: (_ctx, captured) => {
      ops.undone.push(captured.name)
    },
  }
}

function makeContext(): { ctx: CommandContext; events: EventEmitter<CoreEvents>; ops: OpRecord } {
  const events = new EventEmitter<CoreEvents>()
  const graph = new Graph()
  const ctx: CommandContext = { graph, events }
  const ops: OpRecord = { applied: [], undone: [] }
  return { ctx, events, ops }
}

describe('CommandBus — clearHistory', () => {
  it('drops the undo/redo log so nothing can be undone or redone', () => {
    const { ctx, ops } = makeContext()
    const bus = new CommandBus(ctx)
    bus.apply(makeOpCmd('A', ops)); bus.apply(makeOpCmd('B', ops))
    expect(bus.canUndo()).toBe(true)
    bus.clearHistory()
    expect(bus.canUndo()).toBe(false)
    expect(bus.canRedo()).toBe(false)
    expect(bus.undo()).toBe(false)
  })
})

describe('CommandBus — mechanics', () => {
  it('apply() runs the command and returns its result', () => {
    const { ctx, ops } = makeContext()
    const bus = new CommandBus(ctx)
    const result = bus.apply(makeOpCmd('A', ops))
    expect(result).toEqual({ name: 'A' })
    expect(ops.applied).toEqual(['A'])
  })

  it('apply() emits command:applied with the command and result', () => {
    const { ctx, events, ops } = makeContext()
    const bus = new CommandBus(ctx)
    const handler = vi.fn()
    events.on('command:applied', handler)
    bus.apply(makeOpCmd('A', ops))
    expect(handler).toHaveBeenCalledTimes(1)
    const payload = handler.mock.calls[0]?.[0] as { command: Command; result: unknown }
    expect(payload.command.type).toBe('A')
    expect(payload.result).toEqual({ name: 'A' })
  })

  it('undo() invokes command.undo with the captured result', () => {
    const { ctx, ops } = makeContext()
    const bus = new CommandBus(ctx)
    bus.apply(makeOpCmd('A', ops))
    expect(bus.undo()).toBe(true)
    expect(ops.undone).toEqual(['A'])
  })

  it('undo() emits command:undone', () => {
    const { ctx, events, ops } = makeContext()
    const bus = new CommandBus(ctx)
    const handler = vi.fn()
    events.on('command:undone', handler)
    bus.apply(makeOpCmd('A', ops))
    bus.undo()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('undo() returns false when nothing is on the stack', () => {
    const { ctx } = makeContext()
    const bus = new CommandBus(ctx)
    expect(bus.undo()).toBe(false)
  })

  it('redo() re-applies the last undone command', () => {
    const { ctx, ops } = makeContext()
    const bus = new CommandBus(ctx)
    bus.apply(makeOpCmd('A', ops))
    bus.undo()
    expect(bus.redo()).toBe(true)
    expect(ops.applied).toEqual(['A', 'A'])
  })

  it('redo() returns false when nothing is on the redo stack', () => {
    const { ctx } = makeContext()
    const bus = new CommandBus(ctx)
    expect(bus.redo()).toBe(false)
  })

  it('canUndo / canRedo report stack state', () => {
    const { ctx, ops } = makeContext()
    const bus = new CommandBus(ctx)
    expect(bus.canUndo()).toBe(false)
    expect(bus.canRedo()).toBe(false)
    bus.apply(makeOpCmd('A', ops))
    expect(bus.canUndo()).toBe(true)
    expect(bus.canRedo()).toBe(false)
    bus.undo()
    expect(bus.canUndo()).toBe(false)
    expect(bus.canRedo()).toBe(true)
  })

  it('apply() after undo() clears the redo stack', () => {
    const { ctx, ops } = makeContext()
    const bus = new CommandBus(ctx)
    bus.apply(makeOpCmd('A', ops))
    bus.apply(makeOpCmd('B', ops))
    bus.undo()
    expect(bus.canRedo()).toBe(true)
    bus.apply(makeOpCmd('C', ops))
    expect(bus.canRedo()).toBe(false)
  })

  it('undo of multiple commands runs in reverse order', () => {
    const { ctx, ops } = makeContext()
    const bus = new CommandBus(ctx)
    bus.apply(makeOpCmd('A', ops))
    bus.apply(makeOpCmd('B', ops))
    bus.apply(makeOpCmd('C', ops))
    bus.undo()
    bus.undo()
    bus.undo()
    expect(ops.undone).toEqual(['C', 'B', 'A'])
  })

  it('clearHistory() wipes both undo and redo stacks', () => {
    const { ctx, ops } = makeContext()
    const bus = new CommandBus(ctx)
    bus.apply(makeOpCmd('A', ops))
    bus.undo()
    bus.clearHistory()
    expect(bus.canUndo()).toBe(false)
    expect(bus.canRedo()).toBe(false)
  })
})

describe('CommandBus — transactions', () => {
  it('groups multiple apply calls into a single undo step', () => {
    const { ctx, ops } = makeContext()
    const bus = new CommandBus(ctx)
    bus.transaction(() => {
      bus.apply(makeOpCmd('A', ops))
      bus.apply(makeOpCmd('B', ops))
      bus.apply(makeOpCmd('C', ops))
    })
    expect(ops.applied).toEqual(['A', 'B', 'C'])
    bus.undo()
    expect(ops.undone).toEqual(['C', 'B', 'A'])
    expect(bus.canUndo()).toBe(false)
  })

  it('emits transaction:committed once with all member commands', () => {
    const { ctx, events, ops } = makeContext()
    const bus = new CommandBus(ctx)
    const handler = vi.fn()
    events.on('transaction:committed', handler)
    bus.transaction(() => {
      bus.apply(makeOpCmd('A', ops))
      bus.apply(makeOpCmd('B', ops))
    })
    expect(handler).toHaveBeenCalledTimes(1)
    const payload = handler.mock.calls[0]?.[0] as { commands: Command[] }
    expect(payload.commands.map((c) => c.type)).toEqual(['A', 'B'])
  })

  it('redo re-applies the whole transaction in original order', () => {
    const { ctx, ops } = makeContext()
    const bus = new CommandBus(ctx)
    bus.transaction(() => {
      bus.apply(makeOpCmd('A', ops))
      bus.apply(makeOpCmd('B', ops))
    })
    bus.undo()
    bus.redo()
    expect(ops.applied).toEqual(['A', 'B', 'A', 'B'])
  })

  it('throwing inside transaction reverts all commands applied so far', () => {
    const { ctx, ops } = makeContext()
    const bus = new CommandBus(ctx)
    expect(() =>
      bus.transaction(() => {
        bus.apply(makeOpCmd('A', ops))
        bus.apply(makeOpCmd('B', ops))
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(ops.applied).toEqual(['A', 'B'])
    expect(ops.undone).toEqual(['B', 'A'])
    expect(bus.canUndo()).toBe(false)
  })

  it('throwing emits transaction:reverted, not transaction:committed', () => {
    const { ctx, events, ops } = makeContext()
    const bus = new CommandBus(ctx)
    const committed = vi.fn()
    const reverted = vi.fn()
    events.on('transaction:committed', committed)
    events.on('transaction:reverted', reverted)
    try {
      bus.transaction(() => {
        bus.apply(makeOpCmd('A', ops))
        throw new Error('boom')
      })
    } catch {}
    expect(committed).not.toHaveBeenCalled()
    expect(reverted).toHaveBeenCalledTimes(1)
  })

  it('nested transactions join the outer one — single history entry, single committed event', () => {
    const { ctx, ops } = makeContext()
    const bus = new CommandBus(ctx)
    const committed = vi.fn()
    ctx.events.on('transaction:committed', committed)
    bus.transaction(() => {
      bus.apply(makeOpCmd('A', ops))
      bus.transaction(() => {
        bus.apply(makeOpCmd('B', ops))
        bus.transaction(() => {
          bus.apply(makeOpCmd('C', ops))
        })
      })
      bus.apply(makeOpCmd('D', ops))
    })
    expect(ops.applied).toEqual(['A', 'B', 'C', 'D'])
    expect(committed).toHaveBeenCalledTimes(1)        // only the outermost commits
    expect(committed.mock.calls[0]![0].commands.map((c: { type: string }) => c.type)).toEqual(['A', 'B', 'C', 'D'])
    expect(bus.undo()).toBe(true)
    expect(bus.canUndo()).toBe(false)                 // one history entry covers all four
    expect(ops.undone).toEqual(['D', 'C', 'B', 'A'])  // LIFO rollback
  })

  it('nested transaction error rolls back the whole outer transaction', () => {
    const { ctx, ops } = makeContext()
    const bus = new CommandBus(ctx)
    const reverted = vi.fn()
    ctx.events.on('transaction:reverted', reverted)
    try {
      bus.transaction(() => {
        bus.apply(makeOpCmd('A', ops))
        bus.transaction(() => {
          bus.apply(makeOpCmd('B', ops))
          throw new Error('inner blew up')
        })
      })
    } catch {}
    expect(ops.undone).toEqual(['B', 'A'])
    expect(reverted).toHaveBeenCalledTimes(1)
    expect(bus.canUndo()).toBe(false)
  })

  it('transaction returns the value returned by its function', () => {
    const { ctx, ops } = makeContext()
    const bus = new CommandBus(ctx)
    const result = bus.transaction(() => {
      bus.apply(makeOpCmd('A', ops))
      return 42
    })
    expect(result).toBe(42)
  })

  it('empty transaction is a no-op (no undo step)', () => {
    const { ctx } = makeContext()
    const bus = new CommandBus(ctx)
    bus.transaction(() => {})
    expect(bus.canUndo()).toBe(false)
  })
})

describe('CommandBus — history bound', () => {
  it('maxHistory drops the oldest entries when the bound is exceeded', () => {
    const { ctx, ops } = makeContext()
    const bus = new CommandBus(ctx, { maxHistory: 2 })
    bus.apply(makeOpCmd('A', ops))
    bus.apply(makeOpCmd('B', ops))
    bus.apply(makeOpCmd('C', ops))
    bus.undo()
    bus.undo()
    expect(bus.undo()).toBe(false)
    expect(ops.undone).toEqual(['C', 'B'])
  })
})

describe('CommandBus — context', () => {
  it('passes the configured context to commands', () => {
    const { ctx } = makeContext()
    const bus = new CommandBus(ctx)
    const seen: CommandContext[] = []
    bus.apply<undefined>({
      type: 'inspect',
      apply: (received) => {
        seen.push(received)
        return undefined
      },
      undo: () => {},
    })
    expect(seen[0]?.graph).toBe(ctx.graph)
    expect(seen[0]?.events).toBe(ctx.events)
  })
})

let _beforeEach: typeof beforeEach
_beforeEach = beforeEach
void _beforeEach

describe('CommandBus — groups (G10 — Baklava rete-history-plugin parity)', () => {
  it('beginGroup + endGroup collapses N applies into ONE undo entry', () => {
    const { ctx, ops } = makeContext()
    const bus = new CommandBus(ctx)
    bus.beginGroup({ label: 'drag-move' })
    bus.apply(makeOpCmd('A', ops))
    bus.apply(makeOpCmd('B', ops))
    bus.apply(makeOpCmd('C', ops))
    bus.endGroup()
    expect(bus.canUndo()).toBe(true)
    // One undo restores all three (in reverse order).
    bus.undo()
    expect(ops.undone).toEqual(['C', 'B', 'A'])
    expect(bus.canUndo()).toBe(false)
  })

  it('endGroup with no applies leaves the history untouched (no empty entry)', () => {
    const { ctx } = makeContext()
    const bus = new CommandBus(ctx)
    bus.beginGroup()
    bus.endGroup()
    expect(bus.canUndo()).toBe(false)
  })

  it('redundant beginGroup is a no-op (re-entrant safe — does NOT reset the buffer)', () => {
    const { ctx, ops } = makeContext()
    const bus = new CommandBus(ctx)
    bus.beginGroup()
    bus.apply(makeOpCmd('A', ops))
    bus.beginGroup()                                     // ignored — group already open
    bus.apply(makeOpCmd('B', ops))
    bus.endGroup()
    bus.undo()
    expect(ops.undone).toEqual(['B', 'A'])
  })

  it('idleTimeoutMs auto-flushes the group after inactivity', async () => {
    const { ctx, ops } = makeContext()
    const bus = new CommandBus(ctx)
    bus.beginGroup({ idleTimeoutMs: 10 })
    bus.apply(makeOpCmd('A', ops))
    bus.apply(makeOpCmd('B', ops))
    // No more applies → group auto-flushes when the idle timer fires.
    await new Promise((r) => setTimeout(r, 30))
    expect(bus.canUndo()).toBe(true)
    // A fresh apply AFTER the auto-flush should land in its OWN entry, not piggyback on the group.
    bus.apply(makeOpCmd('C', ops))
    bus.undo()                                           // restores C
    expect(ops.undone).toEqual(['C'])
    bus.undo()                                           // restores the AB group
    expect(ops.undone).toEqual(['C', 'B', 'A'])
  })

  it('each apply resets the idle timer (rapid drag stays in one group)', async () => {
    const { ctx, ops } = makeContext()
    const bus = new CommandBus(ctx)
    bus.beginGroup({ idleTimeoutMs: 20 })
    for (let i = 0; i < 5; i++) {
      bus.apply(makeOpCmd(`M${i}`, ops))
      await new Promise((r) => setTimeout(r, 10))        // shorter than the idle window
    }
    bus.endGroup()
    bus.undo()
    expect(ops.undone.length).toBe(5)
  })

  it('transaction() inside an open group still merges (transactions win — single nesting policy)', () => {
    const { ctx, ops } = makeContext()
    const bus = new CommandBus(ctx)
    bus.beginGroup()
    bus.apply(makeOpCmd('A', ops))
    bus.transaction(() => {
      bus.apply(makeOpCmd('B', ops))
      bus.apply(makeOpCmd('C', ops))
    })
    bus.endGroup()
    bus.undo()
    expect(ops.undone).toEqual(['C', 'B', 'A'])
  })

  it('endGroup is idempotent — calling it twice doesn’t double-emit or crash', () => {
    const { ctx, ops } = makeContext()
    const bus = new CommandBus(ctx)
    bus.beginGroup()
    bus.apply(makeOpCmd('A', ops))
    bus.endGroup()
    expect(() => bus.endGroup()).not.toThrow()
    expect(bus.canUndo()).toBe(true)
  })
})
