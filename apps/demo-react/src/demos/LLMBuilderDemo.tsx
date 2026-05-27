import { useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton, reactWidget, type WidgetProps } from '@xenolith/react'
import type { XenolithEditor } from '@xenolith/editor'
import { buildLLMBuilder, type LLMBuilderHandle } from '@xenolith/demo/llm-builder'
import { DemoStage } from '../Layout.js'

// An LLM workflow builder (a prettier LangFlow) built ON the graph: Input → Prompt → Model → Output.
// The graph + the run logic live in the framework-agnostic core (@xenolith/demo/llm-builder); this
// React file only supplies the two custom widget UIs and a Run button wired to handle.run().

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

/** Showcase: an LLM workflow builder driven by the graph. */
export function LLMBuilderDemo() {
  const handle = useRef<LLMBuilderHandle | null>(null)
  const [running, setRunning] = useState(false)

  const onReady = (editor: XenolithEditor): void => {
    editor.registerWidget('prompt-edit', reactWidget(PromptEditor))
    editor.registerWidget('output-view', reactWidget(OutputView))
    handle.current = buildLLMBuilder(editor)
  }
  const run = async (): Promise<void> => {
    if (!handle.current || running) return
    setRunning(true)
    try { await handle.current.run() } finally { setRunning(false) }
  }

  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={onReady}>
        <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 220 }}>
          <XenolithButton active={running} disabled={running} onClick={() => void run()} style={{ width: '100%' }}>
            {running ? 'Running…' : '▶ Run'}
          </XenolithButton>
          <span style={{ color: 'var(--xeno-muted)', fontSize: 11, lineHeight: 1.4 }}>
            Edit the Input / Prompt / Model, then Run — the active node glows and the completion streams in.
          </span>
        </XenolithPanel>
      </XenolithGraph>
    </DemoStage>
  )
}
