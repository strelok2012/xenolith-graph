import type { Command, CommandContext } from './command-bus.js'
import type { Comment, Vec2 } from './graph.js'
import type { CommentId } from './ids.js'

export class AddComment implements Command<void> {
  readonly type = 'AddComment'
  constructor(readonly comment: Comment) {}

  apply(ctx: CommandContext): void {
    ctx.graph._addComment(this.comment)
  }

  undo(ctx: CommandContext): void {
    ctx.graph._removeComment(this.comment.id)
  }
}

export class RemoveComment implements Command<Comment> {
  readonly type = 'RemoveComment'
  constructor(readonly commentId: CommentId) {}

  apply(ctx: CommandContext): Comment {
    const removed = ctx.graph._removeComment(this.commentId)
    if (!removed) throw new Error(`RemoveComment: comment not found: ${this.commentId}`)
    return removed
  }

  undo(ctx: CommandContext, removed: Comment): void {
    ctx.graph._addComment(removed)
  }
}

export class MoveComment implements Command<Vec2> {
  readonly type = 'MoveComment'
  readonly #target: Vec2
  constructor(readonly commentId: CommentId, target: Vec2) {
    this.#target = { x: target.x, y: target.y }
  }

  apply(ctx: CommandContext): Vec2 {
    const c = ctx.graph.getComment(this.commentId)
    if (!c) throw new Error(`MoveComment: comment not found: ${this.commentId}`)
    const old = { x: c.position.x, y: c.position.y }
    ctx.graph._patchComment(this.commentId, { position: { x: this.#target.x, y: this.#target.y } })
    return old
  }

  undo(ctx: CommandContext, old: Vec2): void {
    ctx.graph._patchComment(this.commentId, { position: old })
  }
}

export class ResizeComment implements Command<Vec2> {
  readonly type = 'ResizeComment'
  readonly #target: Vec2
  constructor(readonly commentId: CommentId, target: Vec2) {
    this.#target = { x: target.x, y: target.y }
  }

  apply(ctx: CommandContext): Vec2 {
    const c = ctx.graph.getComment(this.commentId)
    if (!c) throw new Error(`ResizeComment: comment not found: ${this.commentId}`)
    const old = { x: c.size.x, y: c.size.y }
    ctx.graph._patchComment(this.commentId, { size: { x: this.#target.x, y: this.#target.y } })
    return old
  }

  undo(ctx: CommandContext, old: Vec2): void {
    ctx.graph._patchComment(this.commentId, { size: old })
  }
}

export class SetCommentText implements Command<{ text: string; color: string | undefined }> {
  readonly type = 'SetCommentText'
  constructor(
    readonly commentId: CommentId,
    private readonly text: string,
    private readonly color?: string,
  ) {}

  apply(ctx: CommandContext): { text: string; color: string | undefined } {
    const c = ctx.graph.getComment(this.commentId)
    if (!c) throw new Error(`SetCommentText: comment not found: ${this.commentId}`)
    const old = { text: c.text, color: c.color }
    ctx.graph._patchComment(this.commentId, { text: this.text, ...(this.color !== undefined ? { color: this.color } : {}) })
    return old
  }

  undo(ctx: CommandContext, old: { text: string; color: string | undefined }): void {
    ctx.graph._patchComment(this.commentId, { text: old.text, ...(old.color !== undefined ? { color: old.color } : {}) })
  }
}
