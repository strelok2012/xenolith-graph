import { EventEmitter, type Unsubscribe } from './event-emitter.js'
import type { NodeId } from './ids.js'

export type SelectionMode = 'replace' | 'toggle'

export interface SelectionChange {
  ids: readonly NodeId[]
}

type SelectionEvents = {
  'selection:changed': SelectionChange
}

export class Selection {
  readonly #set = new Set<NodeId>()
  readonly #events = new EventEmitter<SelectionEvents>()

  get size(): number {
    return this.#set.size
  }

  contains(id: NodeId): boolean {
    return this.#set.has(id)
  }

  ids(): readonly NodeId[] {
    return [...this.#set]
  }

  select(id: NodeId, mode: SelectionMode): void {
    let changed = false
    if (mode === 'replace') {
      if (this.#set.size === 1 && this.#set.has(id)) return
      this.#set.clear()
      this.#set.add(id)
      changed = true
    } else {
      if (this.#set.has(id)) {
        this.#set.delete(id)
      } else {
        this.#set.add(id)
      }
      changed = true
    }
    if (changed) this.#emit()
  }

  clear(): void {
    if (this.#set.size === 0) return
    this.#set.clear()
    this.#emit()
  }

  replaceWith(ids: readonly NodeId[]): void {
    if (this.#set.size === ids.length && ids.every((id) => this.#set.has(id))) return
    this.#set.clear()
    for (const id of ids) this.#set.add(id)
    this.#emit()
  }

  on(handler: (e: SelectionChange) => void): Unsubscribe {
    return this.#events.on('selection:changed', handler)
  }

  #emit(): void {
    this.#events.emit('selection:changed', { ids: this.ids() })
  }
}
