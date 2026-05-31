import { useCallback, useEffect, useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithControls, XenolithMiniMap, XenolithButton } from '@xenolith/react'
import type { XenolithEditor } from '@xenolith/editor'
import { runtimePlugin, type RtGraph } from '@xenolith/plugin-runtime'
import { mandelbrotV1Graph } from './mandelbrot-v1.js'
import { buildEngines, type Engine, type EngineId, type EngineBundle } from './engines.js'
import { MandelbrotCanvas } from './MandelbrotCanvas.js'
import { InputsPanel } from './InputsPanel.js'

const CANVAS_ENGINE: EngineId = 'as-wasm-args'
const DEFAULT_INPUTS: Record<string, number> = { cx: -0.5, cy: 0, max_iter: 100 }

export function App() {
  const [bundle, setBundle]       = useState<EngineBundle | null>(null)
  const [recompiling, setRecomp]  = useState(false)
  const [fpsMs, setFpsMs]         = useState<number>(0)
  const [pps,   setPps]           = useState<number>(0)
  const [bench, setBench]         = useState<Record<EngineId, number> | null>(null)
  const [benching, setBenching]   = useState(false)
  const [showSrc, setShowSrc]     = useState(false)
  // Single source of truth for input values — both InputsPanel AND the canvas read from this.
  // Changing max_iter here re-drives the canvas immediately (separate from graph structural edits).
  const [inputs, setInputs] = useState<Record<string, number>>(DEFAULT_INPUTS)

  const editorRef = useRef<XenolithEditor | null>(null)
  // Debounce handle for graph→engine rebuild.
  const rebuildTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const rebuildFromEditor = useCallback((editor: XenolithEditor): void => {
    const snap = editor.graphSnapshot()
    const rt: RtGraph = {
      nodes: snap.nodes as RtGraph['nodes'],
      edges: snap.edges as RtGraph['edges'],
    }
    setRecomp(true)
    void buildEngines(rt)
      .then((b) => { setBundle(b); setRecomp(false) })
      .catch((err) => { console.error('[wasm-demo] failed to build engines', err); setRecomp(false) })
  }, [])

  const onReady = (editor: XenolithEditor): void => {
    editorRef.current = editor
    editor.use(runtimePlugin)
    editor.loadJSON(mandelbrotV1Graph())
    requestAnimationFrame(() => { try { editor.fitView({ padding: 60, maxZoom: 0.85 }) } catch { /* renderer still resizing */ } })

    rebuildFromEditor(editor)

    // Rebuild engines whenever the graph changes — Const widget edits, wire connect/disconnect,
    // node add/remove. Debounced so a typing burst on a Const value collapses to one recompile.
    const scheduleRebuild = (): void => {
      if (rebuildTimer.current) clearTimeout(rebuildTimer.current)
      rebuildTimer.current = setTimeout(() => rebuildFromEditor(editor), 250)
    }
    editor.on('widget:changed',     scheduleRebuild)
    editor.on('edge:connected',     scheduleRebuild)
    editor.on('edge:disconnected',  scheduleRebuild)
    editor.on('node:added',         scheduleRebuild)
    editor.on('node:removed',       scheduleRebuild)
  }

  useEffect(() => () => { if (rebuildTimer.current) clearTimeout(rebuildTimer.current) }, [])

  const onFrame = useCallback((info: { engineId: EngineId; pixels: number; ms: number }): void => {
    setFpsMs(info.ms); setPps(info.ms > 0 ? info.pixels / (info.ms / 1000) : 0)
  }, [])

  const runBench = useCallback(async () => {
    if (!bundle) return
    setBenching(true)
    const W = 64, H = 64, MAX = 100
    const out: Record<EngineId, number> = {} as Record<EngineId, number>
    for (const eng of bundle.engines) {
      for (let i = 0; i < 200; i++) eng.pixel(-1 + i * 0.001, i * 0.0005, MAX)
      const t0 = performance.now()
      for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        eng.pixel(-1 + px * 0.001, py * 0.0005, MAX)
      }
      const dt = (performance.now() - t0) / 1000
      out[eng.id] = (W * H) / dt
      await new Promise<void>((r) => setTimeout(r, 0))
    }
    setBench(out)
    setBenching(false)
  }, [bundle])

  const maxIterForCanvas = Math.max(1, Math.floor(inputs['max_iter'] ?? 100))

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {/* === LEFT: editor with the graph ====================================================== */}
      <div style={{ flex: '1 1 60%', minWidth: 0, height: '100%', position: 'relative', borderRight: '1px solid #2a2828' }}>
        <XenolithGraph minimap resizeToWindow={false} onReady={onReady} style={{ width: '100%', height: '100%', position: 'relative' }}>
          <XenolithControls position="bottom-left" />
          <XenolithMiniMap position="bottom-right" />

          <XenolithPanel position="top-left" style={panelStyle}>
            <strong style={{ fontSize: 14 }}>Mandelbrot graph → WebAssembly</strong>
            <div style={{ fontSize: 11, color: 'var(--xeno-muted)', lineHeight: 1.5 }}>
              Edit any Const value or rewire — the graph recompiles to WASM in ~250 ms and the
              canvas re-renders with the new function. Try changing the "4" in the loop guard.
            </div>
          </XenolithPanel>
        </XenolithGraph>
      </div>

      {/* === RIGHT: canvas + perf panel ======================================================= */}
      <div style={{ flex: '0 0 460px', height: '100%', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, background: '#1a1817', overflowY: 'auto', boxSizing: 'border-box' }}>
        <h2 style={{ margin: 0, fontSize: 15, letterSpacing: 0.4, color: '#e6c87a', display: 'flex', alignItems: 'center', gap: 8 }}>
          Live render — AS-WASM tickArgs
          {recompiling && <span style={{ fontSize: 11, color: '#888', fontWeight: 400 }}>· recompiling…</span>}
        </h2>

        {!bundle && <div style={{ color: '#888' }}>Compiling graph to WebAssembly…</div>}
        {bundle && (
          <>
            <MandelbrotCanvas
              engines={bundle.engines}
              activeId={CANVAS_ENGINE}
              maxIter={maxIterForCanvas}
              onFrame={onFrame}
              markerCx={inputs['cx'] ?? 0}
              markerCy={inputs['cy'] ?? 0}
              onPick={(cx, cy) => setInputs((v) => ({ ...v, cx, cy }))}
            />
            <div style={{ fontSize: 11, color: '#888', lineHeight: 1.4 }}>
              Canvas iterates the function over <b>every pixel</b>. <b>Click a pixel</b> → its
              (cx, cy) lands in the panel below, the function runs once with those values, the iter
              shows the result. <b>Drag</b> to pan, <b>wheel</b> to zoom.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, fontSize: 12 }}>
              <span style={{ color: '#888' }}>Last stripe</span>
              <span><b>{fpsMs.toFixed(2)} ms</b> · {fmt(pps)} pixels/s @ max_iter={maxIterForCanvas}</span>
              <span style={{ color: '#888' }}>WASM module</span>
              <span><b>{(bundle.wasmBytes / 1024).toFixed(2)} kB</b> · {bundle.asSource.split('\n').length} lines of AS source</span>
            </div>

            <InputsPanel bundle={bundle} values={inputs} onChange={setInputs} />

            <XenolithButton onClick={runBench} active={!benching} style={{ width: '100%' }}>
              {benching ? 'Benching…' : 'Run benchmark (64×64 tile, 100 iter)'}
            </XenolithButton>

            {bench && (
              <fieldset style={fieldsetStyle}>
                <legend style={{ padding: '0 6px', fontSize: 11, color: '#888' }}>pixels / second (higher = better)</legend>
                <BenchTable bench={bench} engines={bundle.engines} />
              </fieldset>
            )}

            <button type="button" onClick={() => setShowSrc((v) => !v)} style={collapseToggleStyle}>
              {showSrc ? '▾' : '▸'}  AssemblyScript source emitted from the graph
            </button>
            {showSrc && (
              <pre style={sourceStyle}>{bundle.asSource}</pre>
            )}
          </>
        )}

        <p style={{ marginTop: 'auto', fontSize: 10, color: '#666', lineHeight: 1.5 }}>
          Same node graph, five execution backends. <b>AS-WASM (tickArgs)</b> compiles the graph into
          a single WebAssembly function whose hot path is one fat loop with the iteration state in
          WASM globals (lowered to register-allocated locals at function entry).
        </p>
      </div>
    </div>
  )
}

function BenchTable({ bench, engines }: { bench: Record<EngineId, number>; engines: Engine[] }) {
  const max = Math.max(...Object.values(bench))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
      {engines.map((e) => {
        const v = bench[e.id] ?? 0
        const pct = max > 0 ? (v / max) * 100 : 0
        return (
          <div key={e.id} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 80px', alignItems: 'center', gap: 8, fontSize: 11 }}>
            <span style={{ color: e.id.startsWith('as-wasm') ? '#e6c87a' : '#cfcfcf' }}>{e.label}</span>
            <div style={{ height: 8, background: '#2a2828', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: e.id.startsWith('as-wasm') ? '#e6c87a' : '#6a8aaf', transition: 'width 200ms' }} />
            </div>
            <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(v)}</span>
          </div>
        )
      })}
    </div>
  )
}

function fmt(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}k`
  return v.toFixed(0)
}

const panelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, width: 280 }
const fieldsetStyle: React.CSSProperties = { border: '1px solid #2a2828', borderRadius: 6, padding: 10, margin: 0 }
const collapseToggleStyle: React.CSSProperties = {
  background: 'none', border: '1px solid #2a2828', borderRadius: 6, color: '#cfcfcf',
  padding: '8px 10px', textAlign: 'left', cursor: 'pointer', fontSize: 11, width: '100%',
}
const sourceStyle: React.CSSProperties = {
  margin: 0, padding: 12, background: '#0f0e0d', border: '1px solid #2a2828', borderRadius: 6,
  fontSize: 11, lineHeight: 1.5, color: '#cfcfcf', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  // flexShrink: 0 — without this, the parent flex column squeezes the <pre> down to one line.
  // Fixed height (not maxHeight) so the pre always claims its space; scroll for overflow.
  height: 480, flexShrink: 0, overflow: 'auto', whiteSpace: 'pre',
  scrollbarColor: '#3a3838 #1a1817', scrollbarWidth: 'thin',
}
