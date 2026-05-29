import { useRef, useState } from 'react'
import { useXenolithEditor, XenolithButton } from '@xenolith/react'
import { recordGraphGif, downloadBlob } from './gif-export.js'
import { recordGraphVideo, bestVideoMime } from './video-export.js'

const SECONDS = [3, 5, 8] as const

// A themed "Save ▾" dropdown: PNG of the whole graph, a high-quality video (WebM/MP4, recommended),
// or an animated GIF (universal but low-colour). Styled entirely from the editor's --xeno-* theme
// vars so it tracks Xen / Liquid Glass.
export function SaveMenu() {
  const editor = useXenolithEditor()
  const [open, setOpen] = useState(false)
  const [seconds, setSeconds] = useState<number>(5)
  const [progress, setProgress] = useState<number | null>(null) // null = idle
  const [busyLabel, setBusyLabel] = useState('')
  const hostRef = useRef<HTMLDivElement | null>(null)
  const video = bestVideoMime() // null if the browser can't record

  const canvasBg = (): string => {
    const el = hostRef.current
    const v = el && getComputedStyle(el).getPropertyValue('--xeno-canvas').trim()
    return v || '#14130f'
  }

  const savePng = async (): Promise<void> => {
    if (!editor) return
    setOpen(false)
    downloadBlob(await editor.exportImage({ format: 'png', scale: 2, padding: 48 }), 'graph@2x.png')
  }

  const record = async (label: string, run: () => Promise<void>): Promise<void> => {
    if (!editor || progress !== null) return
    setBusyLabel(label)
    setProgress(0)
    try {
      await run()
    } finally {
      setProgress(null)
      setOpen(false)
    }
  }

  const saveVideo = (): Promise<void> =>
    record('video', async () => {
      const { blob, ext } = await recordGraphVideo(editor!, { seconds, fps: 30 }, setProgress)
      downloadBlob(blob, `graph-${seconds}s.${ext}`)
    })

  const saveGif = (): Promise<void> =>
    record('GIF', async () => {
      const blob = await recordGraphGif(editor!, { seconds, fps: 10, background: canvasBg() }, setProgress)
      downloadBlob(blob, `graph-${seconds}s.gif`)
    })

  const recording = progress !== null

  return (
    <div ref={hostRef} style={{ position: 'relative' }}>
      <XenolithButton active={open} style={{ width: '100%' }} onClick={() => setOpen((o) => !o)}>
        {recording ? `Recording ${busyLabel}… ${Math.round((progress ?? 0) * 100)}%` : 'Save ▾'}
      </XenolithButton>

      {open && !recording && (
        <div style={menuStyle}>
          <button style={itemStyle} onClick={() => void savePng()}>PNG image</button>

          <div style={dividerStyle} />

          <div style={{ ...rowStyle, color: 'var(--xeno-muted)' }}>
            <span>Capture</span>
            <select value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} style={selectStyle}>
              {SECONDS.map((s) => <option key={s} value={s}>{s}s</option>)}
            </select>
          </div>
          <button
            style={{ ...itemStyle, color: video ? 'var(--xeno-accent)' : 'var(--xeno-muted)', cursor: video ? 'pointer' : 'not-allowed' }}
            disabled={!video}
            onClick={() => void saveVideo()}
          >
            ● Record {seconds}s video {video ? `(${video.ext.toUpperCase()}, HD)` : '(unsupported)'}
          </button>
          <button style={itemStyle} onClick={() => void saveGif()}>
            ● Record {seconds}s GIF <span style={{ color: 'var(--xeno-muted)' }}>(low colour)</span>
          </button>
          <div style={{ ...rowStyle, fontSize: 10, color: 'var(--xeno-muted)' }}>
            Press Run first — capture records whatever is animating.
          </div>
        </div>
      )}
    </div>
  )
}

const menuStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: 6,
  background: 'var(--xeno-panel, #1b1a17)',
  border: '1px solid var(--xeno-border, rgba(255,255,255,0.1))',
  borderRadius: 'var(--xeno-radius, 8px)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
  zIndex: 10,
}
const itemStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '7px 9px',
  border: 'none',
  borderRadius: 'var(--xeno-radius, 6px)',
  background: 'transparent',
  color: 'var(--xeno-text, #fff)',
  font: 'inherit',
  fontSize: 12,
  cursor: 'pointer',
}
const rowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '4px 9px',
  fontSize: 11,
}
const selectStyle: React.CSSProperties = {
  background: 'var(--xeno-bg, rgba(0,0,0,0.3))',
  color: 'var(--xeno-text, #fff)',
  border: '1px solid var(--xeno-border, rgba(255,255,255,0.12))',
  borderRadius: 4,
  padding: '2px 4px',
  font: 'inherit',
  fontSize: 11,
}
const dividerStyle: React.CSSProperties = {
  height: 1,
  background: 'var(--xeno-divider, rgba(255,255,255,0.08))',
  margin: '2px 0',
}
