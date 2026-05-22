import { EventEmitter, type Unsubscribe } from '@xenolith/core'
import {
  zoomAt as zoomAtMath,
  type Vec2,
  type ViewportState,
  type ZoomBounds,
} from './viewport-math.js'

/**
 * Minimal shape of the object Viewport applies state to. PIXI Container satisfies this — we only
 * touch `scale.{x,y}` and `position.{x,y}`. Keeping the abstraction tiny lets us unit-test the
 * Viewport without a WebGL context (any plain object with `scale`/`position` works).
 */
export interface ApplyTarget {
  scale: { x: number; y: number }
  position: { x: number; y: number }
}

const DEFAULT_STATE: ViewportState = { x: 0, y: 0, zoom: 1 }

type Events = {
  'viewport:changed': ViewportState
}

export class Viewport {
  readonly #target: ApplyTarget
  readonly #events = new EventEmitter<Events>()
  #state: ViewportState

  constructor(target: ApplyTarget, initial: ViewportState = DEFAULT_STATE) {
    this.#target = target
    this.#state = { ...initial }
    this.#apply()
  }

  get state(): ViewportState {
    return { ...this.#state }
  }

  setState(state: ViewportState): void {
    if (
      this.#state.x === state.x &&
      this.#state.y === state.y &&
      this.#state.zoom === state.zoom
    ) {
      return
    }
    this.#state = { ...state }
    this.#apply()
    this.#events.emit('viewport:changed', this.state)
  }

  pan(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return
    this.setState({ ...this.#state, x: this.#state.x + dx, y: this.#state.y + dy })
  }

  zoomAt(focal: Vec2, factor: number, bounds?: ZoomBounds): void {
    this.setState(zoomAtMath(this.#state, focal, factor, bounds))
  }

  reset(): void {
    this.setState(DEFAULT_STATE)
  }

  on(handler: (state: ViewportState) => void): Unsubscribe {
    return this.#events.on('viewport:changed', handler)
  }

  #apply(): void {
    this.#target.scale.x = this.#state.zoom
    this.#target.scale.y = this.#state.zoom
    this.#target.position.x = this.#state.x
    this.#target.position.y = this.#state.y
  }
}
