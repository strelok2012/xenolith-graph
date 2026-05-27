import { useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithControls, useXenolithEditor } from '@xenolith/react'
import { buildConnectionValidation, type Attempt } from '@xenolith/demo/connection-validation'
import { DemoStage } from '../Layout.js'

// Showcase: typed-pin validation + a custom cycle-prevention guard. The graph + the guard live in the
// framework-agnostic core (@xenolith/demo/connection-validation); this React file just renders the
// live attempt log fed by the core's `log` callback.

function RulesPanel({ log }: { log: Attempt[] }): React.ReactElement {
  useXenolithEditor() // ensure mounted inside the editor context
  return (
    <XenolithPanel position="top-right" style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 230 }}>
      <p style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--xeno-muted)' }}>Connection rules</p>
      <span style={{ color: 'var(--xeno-muted)', fontSize: 11, lineHeight: 1.5 }}>
        Pins are typed. Drag <b style={{ color: 'var(--xeno-text)' }}>Text</b> → a float input — refused (snaps back).
        Drag <b style={{ color: 'var(--xeno-text)' }}>C</b> → <b style={{ color: 'var(--xeno-text)' }}>A</b> — blocked (cycle).
      </span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 168, overflow: 'hidden' }}>
        {log.length === 0 && <span style={{ color: 'var(--xeno-muted)', fontSize: 11 }}>No attempts yet.</span>}
        {log.map((a, i) => (
          <span key={i} style={{ fontSize: 11, fontFamily: 'var(--xeno-mono, monospace)', color: a.ok ? '#39d98a' : '#ff5b6e' }}>
            {a.ok ? '✓' : '✗'} {a.text}
          </span>
        ))}
      </div>
    </XenolithPanel>
  )
}

/** Showcase: typed-pin validation + custom cycle-prevention guard. */
export function ConnectionValidationDemo(): React.ReactElement {
  const [log, setLog] = useState<Attempt[]>([])
  const push = (a: Attempt): void => setLog((l) => [a, ...l].slice(0, 8))
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={(editor) => buildConnectionValidation(editor, push)}>
        <XenolithControls position="bottom-left" />
        <RulesPanel log={log} />
      </XenolithGraph>
    </DemoStage>
  )
}
