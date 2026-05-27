import { describe, it, expect } from 'vitest'
import { CommandBus } from './command-bus.js'
import type { CommandContext, CoreEvents } from './command-bus.js'
import { EventEmitter } from './event-emitter.js'
import { Graph } from './graph.js'
import type { Comment } from './graph.js'
import { createCommentId } from './ids.js'
import { AddComment, RemoveComment, MoveComment, ResizeComment, SetCommentText } from './commands-comment.js'

function makeComment(): Comment {
  return {
    id: createCommentId(),
    position: { x: 10, y: 20 },
    size: { x: 300, y: 200 },
    text: 'Group A',
    color: '#FCB400',
  }
}

function makeBus(): { bus: CommandBus; ctx: CommandContext; c: Comment } {
  const events = new EventEmitter<CoreEvents>()
  const graph = new Graph()
  const ctx: CommandContext = { graph, events }
  const bus = new CommandBus(ctx)
  const c = makeComment()
  bus.apply(new AddComment(c))
  return { bus, ctx, c }
}

describe('AddComment', () => {
  it('adds the comment to the graph', () => {
    const { ctx, c } = makeBus()
    expect(ctx.graph.getComment(c.id)?.text).toBe('Group A')
    expect(ctx.graph.commentCount).toBe(1)
  })
  it('undo removes it', () => {
    const { bus, ctx, c } = makeBus()
    bus.undo()
    expect(ctx.graph.getComment(c.id)).toBeUndefined()
    expect(ctx.graph.commentCount).toBe(0)
  })
})

describe('RemoveComment', () => {
  it('removes and undo restores it fully', () => {
    const { bus, ctx, c } = makeBus()
    bus.apply(new RemoveComment(c.id))
    expect(ctx.graph.getComment(c.id)).toBeUndefined()
    bus.undo()
    expect(ctx.graph.getComment(c.id)).toEqual(c)
  })
})

describe('MoveComment', () => {
  it('updates position; undo restores', () => {
    const { bus, ctx, c } = makeBus()
    bus.apply(new MoveComment(c.id, { x: 500, y: 600 }))
    expect(ctx.graph.getComment(c.id)?.position).toEqual({ x: 500, y: 600 })
    bus.undo()
    expect(ctx.graph.getComment(c.id)?.position).toEqual({ x: 10, y: 20 })
  })
})

describe('ResizeComment', () => {
  it('updates size; undo restores', () => {
    const { bus, ctx, c } = makeBus()
    bus.apply(new ResizeComment(c.id, { x: 640, y: 480 }))
    expect(ctx.graph.getComment(c.id)?.size).toEqual({ x: 640, y: 480 })
    bus.undo()
    expect(ctx.graph.getComment(c.id)?.size).toEqual({ x: 300, y: 200 })
  })
})

describe('SetCommentText', () => {
  it('updates text + color; undo restores both', () => {
    const { bus, ctx, c } = makeBus()
    bus.apply(new SetCommentText(c.id, 'Renamed', '#39d98a'))
    expect(ctx.graph.getComment(c.id)?.text).toBe('Renamed')
    expect(ctx.graph.getComment(c.id)?.color).toBe('#39d98a')
    bus.undo()
    expect(ctx.graph.getComment(c.id)?.text).toBe('Group A')
    expect(ctx.graph.getComment(c.id)?.color).toBe('#FCB400')
  })
  it('leaves color untouched when omitted', () => {
    const { bus, ctx, c } = makeBus()
    bus.apply(new SetCommentText(c.id, 'Just text'))
    expect(ctx.graph.getComment(c.id)?.text).toBe('Just text')
    expect(ctx.graph.getComment(c.id)?.color).toBe('#FCB400')
  })
})
