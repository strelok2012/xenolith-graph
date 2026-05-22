export type EventMap = Record<string, unknown>

export type Listener<Payload> = (payload: Payload) => void

export type Unsubscribe = () => void

export type ErrorListener = (error: unknown, eventName: string) => void

export class EventEmitter<Events extends EventMap> {
  readonly #listeners = new Map<keyof Events, Array<Listener<Events[keyof Events]>>>()
  #errorListener: ErrorListener | null = null

  on<E extends keyof Events>(event: E, listener: Listener<Events[E]>): Unsubscribe {
    const list = (this.#listeners.get(event) ?? []) as Array<Listener<Events[E]>>
    list.push(listener)
    this.#listeners.set(event, list as Array<Listener<Events[keyof Events]>>)
    return () => this.off(event, listener)
  }

  off<E extends keyof Events>(event: E, listener: Listener<Events[E]>): void {
    const list = this.#listeners.get(event)
    if (!list) return
    const idx = list.indexOf(listener as Listener<Events[keyof Events]>)
    if (idx !== -1) list.splice(idx, 1)
  }

  once<E extends keyof Events>(event: E, listener: Listener<Events[E]>): Unsubscribe {
    const unsubscribe = this.on(event, (payload) => {
      unsubscribe()
      listener(payload)
    })
    return unsubscribe
  }

  emit<E extends keyof Events>(event: E, payload: Events[E]): void {
    const list = this.#listeners.get(event)
    if (!list || list.length === 0) return
    const snapshot = list.slice()
    for (const listener of snapshot) {
      try {
        ;(listener as Listener<Events[E]>)(payload)
      } catch (err) {
        this.#errorListener?.(err, event as string)
      }
    }
  }

  onError(listener: ErrorListener): void {
    this.#errorListener = listener
  }

  clear<E extends keyof Events>(event?: E): void {
    if (event === undefined) {
      this.#listeners.clear()
    } else {
      this.#listeners.delete(event)
    }
  }

  listenerCount<E extends keyof Events>(event: E): number {
    return this.#listeners.get(event)?.length ?? 0
  }
}
