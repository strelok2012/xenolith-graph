import { useEffect, useRef, useState } from 'react'
import type { Engine, EngineId } from './engines.js'

interface Props {
  engines: Engine[]
  activeId: EngineId
  width?: number
  height?: number
  maxIter?: number
  onFrame?: (info: { engineId: EngineId; pixels: number; ms: number }) => void
  /** Optional marker drawn on top of the canvas — shows where the InputsPanel's (cx, cy) lives in
   *  the complex plane. Makes the relationship "this dot IS the function call you typed" visible. */
  markerCx?: number
  markerCy?: number
  /** Click handler: user clicks a pixel on the canvas → callback receives that pixel's (cx, cy) in
   *  the complex plane. Drives the InputsPanel two-way: type values OR click the canvas. */
  onPick?: (cx: number, cy: number) => void
}

// Renders a Mandelbrot tile using whichever Engine is active. Pan with drag, zoom with wheel.
// Render is synchronous-per-frame but each frame's work fits a budget (≈12 ms) — large tiles are
// painted in horizontal stripes across multiple animation frames so the page stays responsive.
export function MandelbrotCanvas({ engines, activeId, width = 360, height = 240, maxIter = 80, onFrame, markerCx, markerCy, onPick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ctxRef    = useRef<CanvasRenderingContext2D | null>(null)
  const imgRef    = useRef<ImageData | null>(null)

  // Viewport in complex plane. Default frames the classic view.
  const [viewport, setViewport] = useState({ cx0: -2.2, cy0: -1.2, scale: 0.01 })
  const viewRef = useRef(viewport); viewRef.current = viewport

  const activeRef = useRef(activeId); activeRef.current = activeId
  const enginesRef = useRef(engines); enginesRef.current = engines

  // Strip-by-strip render loop. Restarts on viewport / engine / size change. Each rAF paints one
  // stripe (height STRIPE_PX) so even the interpreter doesn't freeze the UI.
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d', { willReadFrequently: false })
    if (!ctx) return
    ctxRef.current = ctx
    canvas.width = width; canvas.height = height
    imgRef.current = ctx.createImageData(width, height)
  }, [width, height])

  useEffect(() => {
    if (!ctxRef.current || !imgRef.current) return
    let cancelled = false
    let y = 0
    const STRIPE_PX = 8

    const tick = (): void => {
      if (cancelled) return
      const eng = enginesRef.current.find((e) => e.id === activeRef.current); if (!eng) return
      const ctx = ctxRef.current; const img = imgRef.current
      if (!ctx || !img) return
      const view = viewRef.current; if (!view) return
      const { cx0, cy0, scale } = view
      try {
        const t0 = performance.now()
        const yEnd = Math.min(height, y + STRIPE_PX)
        for (let py = y; py < yEnd; py++) {
          for (let px = 0; px < width; px++) {
            const cx = cx0 + px * scale
            const cy = cy0 + py * scale
            const iter = eng.pixel(cx, cy, maxIter)
            const i = (py * width + px) * 4
            // Inside set → black. Outside → smooth grey→gold gradient by iter ratio.
            if (iter >= maxIter) {
              img.data[i] = 0; img.data[i + 1] = 0; img.data[i + 2] = 0; img.data[i + 3] = 255
            } else {
              const t = iter / maxIter
              const r = Math.floor(20 + 235 * t)
              const g = Math.floor(15 + 175 * t)
              const b = Math.floor(10 +  80 * t)
              img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255
            }
          }
        }
        const t1 = performance.now()
        ctx.putImageData(img, 0, 0)
        onFrame?.({ engineId: eng.id, pixels: (yEnd - y) * width, ms: t1 - t0 })
        y = yEnd
        if (y < height) requestAnimationFrame(tick)
      } catch (err) {
        console.error('[MandelbrotCanvas] stripe render failed; aborting this run', err)
      }
    }
    requestAnimationFrame(tick)
    return () => { cancelled = true }
  }, [viewport, activeId, width, height, maxIter, onFrame, engines])

  // --- interaction ----------------------------------------------------------
  // `moved` tracks whether the cursor displaced enough to count as a drag; on mouseUp with no
  // displacement, treat as a click → `onPick` (set inputs from canvas coord).
  const dragRef = useRef<{ startX: number; startY: number; cx0: number; cy0: number; moved: boolean } | null>(null)
  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, cx0: viewport.cx0, cy0: viewport.cy0, moved: false }
  }
  const onMouseMove = (e: React.MouseEvent) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    setViewport((v) => ({ ...v, cx0: d.cx0 - dx * v.scale, cy0: d.cy0 - dy * v.scale }))
  }
  const onMouseUp = (e: React.MouseEvent) => {
    const d = dragRef.current
    dragRef.current = null
    if (d && !d.moved && onPick && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      const px = (e.clientX - rect.left) * (width / rect.width)
      const py = (e.clientY - rect.top)  * (height / rect.height)
      const v = viewRef.current
      onPick(v.cx0 + px * v.scale, v.cy0 + py * v.scale)
    }
  }
  // Native non-passive wheel listener — React's `onWheel` is forced-passive in modern React, so
  // `e.preventDefault()` inside it is a no-op and the page scrolls instead of the canvas zooming.
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const handler = (e: WheelEvent): void => {
      e.preventDefault()
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15
      const rect = el.getBoundingClientRect()
      const px = (e.clientX - rect.left) * (width  / rect.width)
      const py = (e.clientY - rect.top)  * (height / rect.height)
      setViewport((v) => {
        const cxAt = v.cx0 + px * v.scale
        const cyAt = v.cy0 + py * v.scale
        const newScale = v.scale * factor
        return { cx0: cxAt - px * newScale, cy0: cyAt - py * newScale, scale: newScale }
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [width, height])

  // Where does the InputsPanel's (markerCx, markerCy) sit on this canvas? Convert complex-plane
  // coords back to pixel coords using the current viewport. Show as crosshair iff in-bounds.
  const markerPx = markerCx === undefined ? null : (markerCx - viewport.cx0) / viewport.scale
  const markerPy = markerCy === undefined ? null : (markerCy - viewport.cy0) / viewport.scale
  const markerIn = markerPx !== null && markerPy !== null && markerPx >= 0 && markerPx < width && markerPy >= 0 && markerPy < height

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: dragRef.current ? 'grabbing' : 'grab', imageRendering: 'pixelated', width: '100%', height: 'auto', borderRadius: 6, boxShadow: '0 2px 16px rgba(0,0,0,0.35)' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      />
      {markerIn && markerPx !== null && markerPy !== null && (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          <line x1={markerPx} y1={0} x2={markerPx} y2={height} stroke="#e6c87a" strokeWidth={0.8} strokeDasharray="2 2" opacity={0.8} />
          <line x1={0} y1={markerPy} x2={width} y2={markerPy} stroke="#e6c87a" strokeWidth={0.8} strokeDasharray="2 2" opacity={0.8} />
          <circle cx={markerPx} cy={markerPy} r={5} fill="none" stroke="#e6c87a" strokeWidth={1.2} />
          <circle cx={markerPx} cy={markerPy} r={1.5} fill="#e6c87a" />
        </svg>
      )}
    </div>
  )
}
