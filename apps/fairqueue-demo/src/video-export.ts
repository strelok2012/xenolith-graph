// Record the animated graph to a real video (WebM/MP4) via MediaRecorder — full colour, smooth, a
// fraction of a GIF's size, no 256-colour banding. Records the live editor canvas stream in real
// time, so the animation plays into the file as it happens. Public-API only (`editor.app.canvas`),
// plugin-ready alongside gif-export.ts.

import type { XenolithEditor } from '@xenolith/editor'

// Most-preferred first: MP4/H.264 plays everywhere; VP9 is great quality in Chromium/Firefox.
const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const

/** The best video container/codec this browser can record, or null if MediaRecorder is unavailable. */
export function bestVideoMime(): { mimeType: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null
  for (const m of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(m)) return { mimeType: m, ext: m.startsWith('video/mp4') ? 'mp4' : 'webm' }
  }
  return null
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export interface VideoOptions {
  seconds: number
  fps?: number // capture frame rate, default 30
  bitrate?: number // default 12 Mbps — crisp at typical graph sizes
}

export async function recordGraphVideo(
  editor: XenolithEditor,
  opts: VideoOptions,
  onProgress?: (fraction: number) => void,
): Promise<{ blob: Blob; ext: string }> {
  const pick = bestVideoMime()
  if (!pick) throw new Error('Video recording not supported in this browser')

  const canvas = editor.app.canvas as HTMLCanvasElement
  const stream = canvas.captureStream(opts.fps ?? 30)
  const rec = new MediaRecorder(stream, { mimeType: pick.mimeType, videoBitsPerSecond: opts.bitrate ?? 12_000_000 })
  const chunks: BlobPart[] = []
  rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
  const stopped = new Promise<void>((resolve) => { rec.onstop = () => resolve() })

  rec.start(100) // emit a chunk every 100ms
  const t0 = performance.now()
  const ticker = setInterval(() => onProgress?.(Math.min(1, (performance.now() - t0) / (opts.seconds * 1000))), 100)
  await delay(opts.seconds * 1000)
  clearInterval(ticker)
  rec.stop()
  await stopped
  stream.getTracks().forEach((t) => t.stop())
  onProgress?.(1)
  return { blob: new Blob(chunks, { type: pick.mimeType }), ext: pick.ext }
}
