import { useEffect, useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton } from '@xenolith/react'
import type { XenolithEditor } from '@xenolith/editor'
import { buildAudioSynth, type AudioSynthHandle } from '@xenolith/demo/audio-synth'
import { DemoStage } from '../Layout.js'

// A tiny Web Audio synth built ON the graph: Oscillator → Filter → Gain → Output. The graph, the
// audio wiring and the live re-tune/re-wire logic all live in the framework-agnostic core
// (@xenolith/demo/audio-synth) — this React file is just a Play/Stop button bound to the handle.

/** Showcase: a real Web Audio synth built on the node graph. */
export function AudioSynthDemo() {
  const handle = useRef<AudioSynthHandle | null>(null)
  const [playing, setPlaying] = useState(false)

  const onReady = (editor: XenolithEditor): void => { handle.current = buildAudioSynth(editor) }
  const toggle = (): void => {
    if (!handle.current) return
    if (playing) handle.current.stop()
    else handle.current.play()
    setPlaying(!playing)
  }
  useEffect(() => () => handle.current?.dispose(), [])

  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={onReady}>
        <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 220 }}>
          <XenolithButton active={playing} onClick={toggle} style={{ width: '100%' }}>
            {playing ? '■ Stop' : '▶ Play'}
          </XenolithButton>
          <span style={{ color: 'var(--xeno-muted)', fontSize: 11, lineHeight: 1.4 }}>
            Tweak the knobs while it plays — the chain is wired from the graph; the active path glows.
          </span>
        </XenolithPanel>
      </XenolithGraph>
    </DemoStage>
  )
}
