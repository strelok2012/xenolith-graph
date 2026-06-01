import { useEffect, useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton, useEditor } from '@xenolith/react'
import { loadAudioGraph, createAudioEngine, type AudioSynthHandle } from '@xenolith/demo/audio-synth'
import { DemoStage } from '../Layout.js'

// A tiny Web Audio synth built ON the graph: Oscillator → Filter → Gain → Output.
//
// Canon: the engine (an external system: AudioContext + event subscriptions) lives where it's
// used — inside the panel that drives it. `useEditor()` gives the editor directly; a ref holds
// the engine because it's imperative, not state; the effect's cleanup disposes on unmount.

function AudioPanel() {
  const editor = useEditor()
  const engineRef = useRef<AudioSynthHandle | null>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    engineRef.current = createAudioEngine(editor)
    return () => { engineRef.current?.dispose(); engineRef.current = null }
  }, [editor])

  const toggle = () => {
    const eng = engineRef.current
    if (!eng) return
    if (playing) eng.stop()
    else eng.play()
    setPlaying(!playing)
  }

  return (
    <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 220 }}>
      <XenolithButton active={playing} onClick={toggle} style={{ width: '100%' }}>
        {playing ? '■ Stop' : '▶ Play'}
      </XenolithButton>
      <span style={{ color: 'var(--xeno-muted)', fontSize: 11, lineHeight: 1.4 }}>
        Tweak the knobs while it plays — the chain is wired from the graph; the active path glows.
      </span>
    </XenolithPanel>
  )
}

/** Showcase: a real Web Audio synth built on the node graph. */
export function AudioSynthDemo() {
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={loadAudioGraph}>
        <AudioPanel />
      </XenolithGraph>
    </DemoStage>
  )
}
