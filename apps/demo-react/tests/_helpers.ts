import type { Page } from '@playwright/test'

/** Capture the PIXI stage as raw RGBA pixels. Bypasses `preserveDrawingBuffer:false` (which
 *  makes `page.screenshot()` see only the DOM, not WebGL pixels) by using PIXI's own extract
 *  API on the live renderer. Returns the OffscreenCanvas-equivalent ImageData buffer. */
export async function captureCanvas(page: Page): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  return await page.evaluate(() => {
    type W = { __xenoDebug?: { editor: { app: { renderer: { extract: { canvas: (t?: unknown) => HTMLCanvasElement } }; stage: unknown } } } }
    const ed = (window as unknown as W).__xenoDebug?.editor
    if (!ed) throw new Error('captureCanvas: window.__xenoDebug.editor missing — page must expose it')
    const c = ed.app.renderer.extract.canvas(ed.app.stage)
    const ctx = (c as HTMLCanvasElement).getContext('2d')!
    const img = ctx.getImageData(0, 0, c.width, c.height)
    return { data: Array.from(img.data) as unknown as Uint8ClampedArray, width: c.width, height: c.height }
  }) as Promise<{ data: Uint8ClampedArray; width: number; height: number }>
}

/** Count pixels whose RGB is within `tolerance` of `target`. Useful for asserting that a
 *  themed marker (ring, dot, line) was actually painted. */
export function countPixelsNear(
  cap: { data: Uint8ClampedArray; width: number; height: number },
  target: { r: number; g: number; b: number },
  tolerance = 30,
): number {
  let count = 0
  const d = cap.data
  for (let i = 0; i < d.length; i += 4) {
    if (Math.abs(d[i]! - target.r) <= tolerance
      && Math.abs(d[i + 1]! - target.g) <= tolerance
      && Math.abs(d[i + 2]! - target.b) <= tolerance) count++
  }
  return count
}

export const RING_OK = { r: 57,  g: 217, b: 138 } // '#39d98a'
export const RING_RUNNING_XEN = { r: 252, g: 180, b: 0 } // xen accent '#fcb400'
export const RING_ERROR = { r: 255, g: 91, b: 110 } // '#ff5b6e'
