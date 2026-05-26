import { useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithControls, useXenolithEditor } from '@xenolith/react'
import type { XenolithEditor, NodeSchema, Node } from '@xenolith/editor'
import { wouldCreateCycle } from '@xenolith/core'
import { DemoStage } from '../Layout.js'

// Showcase: connection rules. Pins are typed (Blueprint-style) so the built-in check refuses a
// string→number wire automatically — watch it snap back. On top of that, a custom isValidConnection
// guard uses the core wouldCreateCycle() helper to forbid loops. Every attempt is logged live.

export interface Attempt { ok: boolean; text: string }

const FLOAT_INOUT = (title: string): NodeSchema => ({
  type: title, title, category: 'data',
  pins: [
    { kind: 'data', direction: 'in', type: 'float', label: 'In' },
    { kind: 'data', direction: 'out', type: 'float', label: 'Out' },
  ],
})

function setup(editor: XenolithEditor, log: (a: Attempt) => void): void {
  editor.registry.register(FLOAT_INOUT('A'))
  editor.registry.register(FLOAT_INOUT('B'))
  editor.registry.register(FLOAT_INOUT('C'))
  editor.registry.register({ type: 'Text', title: 'Text', category: 'logic', pins: [{ kind: 'data', direction: 'out', type: 'string', label: 'Out' }] })
  editor.registry.register({ type: 'Caption', title: 'Caption', category: 'logic', pins: [{ kind: 'data', direction: 'in', type: 'string', label: 'In' }] })

  const a = editor.registry.instantiate('A', { x: 0, y: 40 })
  const b = editor.registry.instantiate('B', { x: 230, y: 40 })
  const c = editor.registry.instantiate('C', { x: 460, y: 40 })
  const text = editor.registry.instantiate('Text', { x: 40, y: 210 })
  const caption = editor.registry.instantiate('Caption', { x: 460, y: 210 })
  for (const n of [a, b, c, text, caption]) editor.addNode(n)
  editor.connect(a, 1, b, 0) // A.out → B.in  (float)
  editor.connect(b, 1, c, 0) // B.out → C.in  (float)
  editor.connect(text, 0, caption, 0) // Text.out → Caption.in (string)

  const name = (id: Node['id']): string => editor.graph.getNode(id)?.type ?? '?'
  editor.setIsValidConnection((conn) => {
    if (wouldCreateCycle(editor.graph, conn.source, conn.target)) {
      log({ ok: false, text: `${name(conn.source)} → ${name(conn.target)} · would create a cycle` })
      return false
    }
    return true
  })
  editor.on('edge:connected', (e) => log({ ok: true, text: `${name(e.edge.from.node)} → ${name(e.edge.to.node)} · connected` }))

  editor.fitView({ padding: 64, maxZoom: 1 })
}

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
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={(editor) => setup(editor, push)}>
        <XenolithControls position="bottom-left" />
        <RulesPanel log={log} />
      </XenolithGraph>
    </DemoStage>
  )
}
