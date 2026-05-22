import { EventEmitter, type Unsubscribe } from '@xenolith/core'
import type { Vec2 } from './viewport-math.js'

/**
 * Convert a `WheelEvent.deltaY` to a multiplicative zoom factor. Positive delta (scroll down)
 * zooms out (factor < 1), negative zooms in (factor > 1). Uses an exponential curve so the same
 * notch always changes zoom by the same proportion, regardless of current zoom level.
 *
 * One default OS scroll click produces deltaY ≈ ±100; we map that to ~0.82× / 1.22× zoom step.
 */
export function wheelDeltaToZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY / 500)
}

type InteractionEvents = {
  'intent:zoom': { focal: Vec2; factor: number }
  'intent:pan':  { dx: number; dy: number }
}

export interface InteractionManagerOptions {
  /** Mouse buttons that initiate a pan-drag. Defaults to middle (1) and right (2). */
  panButtons?: readonly number[]
}

export class InteractionManager {
  readonly #target: HTMLElement
  readonly #events = new EventEmitter<InteractionEvents>()
  readonly #panButtons: ReadonlySet<number>
  #panActiveButton: number | null = null
  #lastPanX = 0
  #lastPanY = 0

  constructor(target: HTMLElement, opts: InteractionManagerOptions = {}) {
    this.#target = target
    this.#panButtons = new Set(opts.panButtons ?? [1, 2])
  }

  attach(): void {
    this.#target.addEventListener('wheel', this.#onWheel, { passive: false })
    this.#target.addEventListener('pointerdown', this.#onPointerDown)
    this.#target.addEventListener('pointermove', this.#onPointerMove)
    this.#target.addEventListener('pointerup', this.#onPointerUp)
    this.#target.addEventListener('pointercancel', this.#onPointerUp)
    this.#target.addEventListener('contextmenu', this.#onContextMenu)
  }

  detach(): void {
    this.#target.removeEventListener('wheel', this.#onWheel)
    this.#target.removeEventListener('pointerdown', this.#onPointerDown)
    this.#target.removeEventListener('pointermove', this.#onPointerMove)
    this.#target.removeEventListener('pointerup', this.#onPointerUp)
    this.#target.removeEventListener('pointercancel', this.#onPointerUp)
    this.#target.removeEventListener('contextmenu', this.#onContextMenu)
  }

  onZoom(handler: (e: InteractionEvents['intent:zoom']) => void): Unsubscribe {
    return this.#events.on('intent:zoom', handler)
  }

  onPan(handler: (e: InteractionEvents['intent:pan']) => void): Unsubscribe {
    return this.#events.on('intent:pan', handler)
  }

  #localPoint(clientX: number, clientY: number): Vec2 {
    const rect = this.#target.getBoundingClientRect()
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  #onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    const focal = this.#localPoint(e.clientX, e.clientY)
    const factor = wheelDeltaToZoomFactor(e.deltaY)
    this.#events.emit('intent:zoom', { focal, factor })
  }

  #onPointerDown = (e: PointerEvent): void => {
    if (!this.#panButtons.has(e.button)) return
    this.#panActiveButton = e.button
    this.#lastPanX = e.clientX
    this.#lastPanY = e.clientY
    this.#target.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  #onPointerMove = (e: PointerEvent): void => {
    if (this.#panActiveButton === null) return
    const dx = e.clientX - this.#lastPanX
    const dy = e.clientY - this.#lastPanY
    this.#lastPanX = e.clientX
    this.#lastPanY = e.clientY
    if (dx !== 0 || dy !== 0) {
      this.#events.emit('intent:pan', { dx, dy })
    }
  }

  #onPointerUp = (e: PointerEvent): void => {
    if (this.#panActiveButton === null) return
    if (this.#target.hasPointerCapture(e.pointerId)) {
      this.#target.releasePointerCapture(e.pointerId)
    }
    this.#panActiveButton = null
  }

  #onContextMenu = (e: MouseEvent): void => {
    // Right-click is a pan gesture for us — suppress the browser context menu.
    e.preventDefault()
  }
}
