import type { Pin } from '@xenolith/core'

export interface ConnectContext {
  /** Existing incident edges on pin `a`. Used to enforce `multiple: false` capacity. Default 0. */
  sourceEdges?: number
  /** Existing incident edges on pin `b`. Used to enforce `multiple: false` capacity. Default 0. */
  targetEdges?: number
}

/**
 * Predicate: can a candidate edge from pin `a` to pin `b` be created?
 *
 * Rules (v0.1, intentionally simple — full type system arrives with NodeSchema):
 *  - directions must be opposite
 *  - cannot wire a node to itself
 *  - exec ↔ data is forbidden (blueprint semantic)
 *  - data: types must match exactly, OR either side declares `any`
 *  - exec: any exec-pin pair is valid regardless of `type`
 *  - capacity: a pin with `multiple: false` that already has ≥1 edge cannot accept another
 *
 * The check is orientation-agnostic: callers don't pre-sort (out, in). Capacity counts in
 * `ctx` apply positionally — `sourceEdges` to `a`, `targetEdges` to `b`.
 */
export function canConnect(a: Pin, b: Pin, sameNode: boolean, ctx: ConnectContext = {}): boolean {
  if (sameNode) return false
  if (a.direction === b.direction) return false
  if (a.kind !== b.kind) return false
  if (!a.multiple && (ctx.sourceEdges ?? 0) > 0) return false
  if (!b.multiple && (ctx.targetEdges ?? 0) > 0) return false
  if (a.kind === 'exec') return true
  const ta = String(a.type)
  const tb = String(b.type)
  if (ta === 'any' || tb === 'any') return true
  return ta === tb
}
