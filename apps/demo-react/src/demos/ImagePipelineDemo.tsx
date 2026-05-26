import { useRef } from 'react'
import { XenolithGraph, XenolithControls, XenolithPanel, XenolithButton, useXenolithEditor, reactWidget, type WidgetProps } from '@xenolith/react'
import { buildImagePipeline, type ImagePipelineHandle } from '@xenolith/demo/image-pipeline'
import { DemoStage } from '../Layout.js'

// Showcase: a real WebGL image pipeline. All the framework-agnostic logic (GLSL runner, filter
// schemas, chain layout, live re-processing, download) lives in @xenolith/demo/image-pipeline —
// React only supplies the two preview widgets and the panel. Vue/Svelte reuse the same core.

function ImageInput({ value, setValue }: WidgetProps): React.ReactElement {
  const onFile = (file?: File): void => {
    if (!file) return
    const r = new FileReader()
    r.onload = () => setValue(String(r.result))
    r.readAsDataURL(file)
  }
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files?.[0]) }}
      style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 8, overflow: 'hidden', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--xeno-border)' }}
    >
      {value
        ? <img src={String(value)} alt="source" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
        : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--xeno-muted)', fontSize: 12 }}>Drop an image</div>}
      <label style={{ position: 'absolute', bottom: 6, right: 6, fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'var(--xeno-elevated)', color: 'var(--xeno-text)', cursor: 'pointer', border: '1px solid var(--xeno-border)' }}>
        Replace
        <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
    </div>
  )
}

function ImageOutput({ value }: WidgetProps): React.ReactElement {
  return (
    <div style={{ width: '100%', height: '100%', borderRadius: 8, overflow: 'hidden', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--xeno-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {value
        ? <img src={String(value)} alt="result" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <span style={{ color: 'var(--xeno-muted)', fontSize: 12 }}>Rendering…</span>}
    </div>
  )
}

function PipelinePanel({ handle }: { handle: React.RefObject<ImagePipelineHandle | null> }): React.ReactElement {
  useXenolithEditor()
  return (
    <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 200 }}>
      <p style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--xeno-muted)' }}>Image pipeline</p>
      <XenolithButton style={{ width: '100%' }} onClick={() => handle.current?.download()}>↓ Download result.png</XenolithButton>
      <span style={{ color: 'var(--xeno-muted)', fontSize: 11, lineHeight: 1.45 }}>
        Each node is a live GLSL pass. Drag a slider — the result re-renders. Drop your own image on the Source node.
      </span>
    </XenolithPanel>
  )
}

/** Showcase: real WebGL image filters as a node graph. Thin React shell over the shared core. */
export function ImagePipelineDemo(): React.ReactElement {
  const handle = useRef<ImagePipelineHandle | null>(null)
  return (
    <DemoStage>
      <XenolithGraph
        className="xeno"
        resizeToWindow={false}
        onReady={(editor) => {
          handle.current = buildImagePipeline(editor, { input: reactWidget(ImageInput), output: reactWidget(ImageOutput) })
        }}
      >
        <XenolithControls position="bottom-left" />
        <PipelinePanel handle={handle} />
      </XenolithGraph>
    </DemoStage>
  )
}
