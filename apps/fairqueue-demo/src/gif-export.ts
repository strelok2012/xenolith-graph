// Record the animated graph to a GIF — framework-agnostic, public-API only. Captures whole-graph
// frames via `editor.exportImage()` over `seconds` (awaiting between grabs so the editor ticker
// advances animated edges + the sim ticks), then encodes them with gifenc. Designed to be lifted
// out of the demo into a `@xenolith/plugin-gif` later: it depends on nothing but XenolithEditor.
//
// Frame size = the graph's bounds (constant as long as no node is moved/added during recording), so
// the caller should freeze topology while recording. PNG export is transparent, so each frame is
// composited over `background` to avoid GIF's broken alpha.

import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import type { XenolithEditor } from '@xenolith/editor'

export interface GifOptions {
  seconds: number
  fps?: number // default 10
  scale?: number // export resolution multiplier, default 1
  background?: string // CSS colour composited under each (transparent) frame
}

/** Frames to capture for a given duration/fps — pure, so it's unit-testable. */
export function gifFrameCount(seconds: number, fps: number): number {
  return Math.max(1, Math.round(seconds * fps))
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export async function recordGraphGif(
  editor: XenolithEditor,
  opts: GifOptions,
  onProgress?: (fraction: number) => void,
): Promise<Blob> {
  const fps = opts.fps ?? 10
  const scale = opts.scale ?? 1
  const background = opts.background ?? '#14130f'
  const frames = gifFrameCount(opts.seconds, fps)
  const interval = 1000 / fps

  // --- capture live, pacing to wall-clock so the animation advances between grabs ---
  const bitmaps: ImageBitmap[] = []
  for (let i = 0; i < frames; i++) {
    const t0 = performance.now()
    const blob = await editor.exportImage({ format: 'png', scale })
    bitmaps.push(await createImageBitmap(blob))
    onProgress?.(((i + 1) / frames) * 0.6) // capture is the first 60% of the work
    const spent = performance.now() - t0
    if (spent < interval) await delay(interval - spent)
  }

  // --- encode (pure CPU; fine to block the frame) ---
  const w = bitmaps[0]!.width
  const h = bitmaps[0]!.height
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const gif = GIFEncoder()
  for (let i = 0; i < bitmaps.length; i++) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmaps[i]!, 0, 0)
    const { data } = ctx.getImageData(0, 0, w, h)
    const palette = quantize(data, 256)
    const index = applyPalette(data, palette)
    gif.writeFrame(index, w, h, { palette, delay: interval })
    bitmaps[i]!.close()
    onProgress?.(0.6 + ((i + 1) / bitmaps.length) * 0.4)
  }
  gif.finish()
  return new Blob([gif.bytes()], { type: 'image/gif' })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
