import { useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton, reactWidget, useEditor, type WidgetProps } from '@xenolith/react'
import type { XenolithEditor } from '@xenolith/editor'
import { loadLLMGraph, runLLM } from '@xenolith/demo/llm-builder'
import { DemoStage } from '../Layout.js'

// LLM workflow builder built on the graph: Input → Prompt → Model → Output.
// Canon: the Run button owns its own state + side-effect; `useEditor()` gives it the editor;
// the runner is a pure function over the editor — no handle, no subscriptions, no instance.

const box: React.CSSProperties = {
  width: '100%', height: '100%', boxSizing: 'border-box', font: 'inherit', fontSize: 11,
  background: 'var(--xeno-bg)', color: 'var(--xeno-text)', border: '1px solid var(--xeno-border)',
  borderRadius: 6, padding: 6, resize: 'none',
}
function PromptEditor({ value, setValue }: WidgetProps) {
  return <textarea style={box} spellCheck={false} value={String(value ?? '')} onChange={(e) => setValue(e.target.value)} />
}
function OutputView({ value }: WidgetProps) {
  const text = String(value ?? '')
  return (
    <div style={{ ...box, overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace, monospace', color: text ? 'var(--xeno-text)' : 'var(--xeno-muted)' }}>
      {text || 'Run to generate…'}
    </div>
  )
}

function setupLLM(editor: XenolithEditor): void {
  editor.registerWidget('prompt-edit', reactWidget(PromptEditor))
  editor.registerWidget('output-view', reactWidget(OutputView))
  loadLLMGraph(editor)
}

function RunPanel() {
  const editor = useEditor()
  const [running, setRunning] = useState(false)
  const onRun = async (): Promise<void> => {
    if (running) return
    setRunning(true)
    try { await runLLM(editor) } finally { setRunning(false) }
  }
  return (
    <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 220 }}>
      <XenolithButton active={running} disabled={running} onClick={() => void onRun()} style={{ width: '100%' }}>
        {running ? 'Running…' : '▶ Run'}
      </XenolithButton>
      <span style={{ color: 'var(--xeno-muted)', fontSize: 11, lineHeight: 1.4 }}>
        Edit the Input / Prompt / Model, then Run — the active node glows and the completion streams in.
      </span>
    </XenolithPanel>
  )
}

/** Showcase: an LLM workflow builder driven by the graph. */
export function LLMBuilderDemo() {
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={setupLLM}>
        <RunPanel />
      </XenolithGraph>
    </DemoStage>
  )
}
