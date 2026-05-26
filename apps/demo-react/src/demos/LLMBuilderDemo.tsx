import { useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton, reactWidget, useXenolithEditor, type WidgetProps } from '@xenolith/react'
import { topoOrder, incomers, reachableFrom } from '@xenolith/core'
import type { XenolithEditor, NodeId, Node, NodeSchema } from '@xenolith/editor'
import { DemoStage } from '../Layout.js'

// An LLM workflow builder (prettier LangFlow) built ON the graph: Input → Prompt → Model → Output.
// Run walks the graph in topological order, feeds each node its upstream outputs, lights the active
// node (setNodeStatus), and streams the "completion" into the Output node. Showcases topoOrder +
// incomers, node status, custom React-component widgets, and typed pins.

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

const SCHEMAS: NodeSchema[] = [
  { type: 'Input', title: 'Input',
    pins: [{ kind: 'data', direction: 'out', type: 'text', label: 'Out' }],
    widgets: [{ id: 'value', type: 'text', key: 'value', label: 'Value' }] },
  { type: 'Prompt', title: 'Prompt',
    pins: [{ kind: 'data', direction: 'in', type: 'text', label: 'In' }, { kind: 'data', direction: 'out', type: 'text', label: 'Out' }],
    widgets: [{ id: 'template', type: 'custom', renderer: 'prompt-edit', key: 'template', label: 'Template', height: 60 }] },
  { type: 'Model', title: 'Model',
    pins: [{ kind: 'data', direction: 'in', type: 'text', label: 'In' }, { kind: 'data', direction: 'out', type: 'text', label: 'Out' }],
    widgets: [
      { id: 'model', type: 'combo', key: 'model', label: 'Model', values: ['GPT-4o mini', 'Claude 3.5', 'Llama 3'] },
      { id: 'temp', type: 'slider', key: 'temp', label: 'Temp', min: 0, max: 1, step: 0.05 },
    ] },
  { type: 'Output', title: 'Output',
    pins: [{ kind: 'data', direction: 'in', type: 'text', label: 'In' }],
    widgets: [{ id: 'result', type: 'custom', renderer: 'output-view', key: 'result', label: 'Result', height: 92 }] },
]

const DEFAULTS: Record<string, Record<string, unknown>> = {
  Input: { value: 'autumn leaves' },
  Prompt: { template: 'Write a haiku about {input}.' },
  Model: { model: 'GPT-4o mini', temp: 0.7 },
  Output: { result: '' },
}

function buildGraph(editor: XenolithEditor): void {
  editor.registerWidget('prompt-edit', reactWidget(PromptEditor))
  editor.registerWidget('output-view', reactWidget(OutputView))
  for (const s of SCHEMAS) editor.registry.register(s)
  const place: Record<string, { x: number; y: number }> = {
    Input: { x: 0, y: 40 }, Prompt: { x: 250, y: 40 }, Model: { x: 510, y: 40 }, Output: { x: 770, y: 40 },
  }
  const made: Node[] = []
  for (const s of SCHEMAS) {
    const n = editor.registry.instantiate(s.type, place[s.type]!)
    Object.assign(n.state, DEFAULTS[s.type])
    editor.addNode(n)
    made.push(n)
  }
  const link = (a: Node, b: Node): void => {
    const oi = a.pins.findIndex((p) => p.direction === 'out')
    const ii = b.pins.findIndex((p) => p.direction === 'in')
    if (oi >= 0 && ii >= 0) editor.connect(a, oi, b, ii)
  }
  for (let i = 0; i < made.length - 1; i++) link(made[i]!, made[i + 1]!)
  editor.fitView({ padding: 56, maxZoom: 1 })
}

function fakeComplete(prompt: string, model: string): string {
  const topic = (prompt.match(/about ([^.\n]+)/i)?.[1] ?? prompt.split('\n').pop() ?? 'the graph').trim()
  return `${topic} drifting down —\nbright wires hum across the nodes,\nthe graph dreams in code.\n\n— ${model}`
}
const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
function streamText(full: string, onChunk: (s: string) => void): Promise<void> {
  return new Promise((res) => {
    let i = 0
    const step = (): void => { i += 2; onChunk(full.slice(0, i)); if (i < full.length) setTimeout(step, 18); else res() }
    step()
  })
}

/** Run control — a separate in-editor panel. Walks the graph (topoOrder), feeds each node its
 *  incomers' outputs, lights the active node, and streams the completion into Output. */
function RunPanel() {
  const editor = useXenolithEditor()
  const [running, setRunning] = useState(false)
  const run = async (): Promise<void> => {
    if (!editor || running) return
    setRunning(true)
    editor.clearNodeStatuses()
    // Only run the chain wired up from the Input node — a disconnected (or just-deleted) node is
    // not part of the flow and must not light up or be processed.
    const inputId = [...editor.graph.nodes()].find((n) => n.type === 'Input')?.id
    const active = inputId ? reachableFrom(editor.graph, inputId) : new Set<NodeId>()
    const { order } = topoOrder(editor.graph)
    const out = new Map<NodeId, string>()
    try {
      for (const id of order) {
        if (!active.has(id)) continue
        const node = editor.graph.getNode(id)
        if (!node) continue
        editor.setNodeStatus(id, 'running')
        const ins = incomers(editor.graph, id).map((n) => out.get(n.id) ?? '').join('\n').trim()
        let result = ''
        if (node.type === 'Input') result = String(node.state['value'] ?? '')
        else if (node.type === 'Prompt') result = String(node.state['template'] ?? '').replace(/\{[^}]*\}/g, ins || '…')
        else if (node.type === 'Model') result = fakeComplete(ins, String(node.state['model'] ?? 'model'))
        else if (node.type === 'Output') result = ins
        out.set(id, result)
        if (node.type === 'Output') await streamText(result, (p) => editor.setWidgetValue(id, 'result', p))
        else await delay(node.type === 'Model' ? 480 : 200)
        editor.setNodeStatus(id, 'ok')
      }
    } finally {
      setRunning(false)
    }
  }
  return (
    <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 220 }}>
      <XenolithButton active={running} disabled={running} onClick={() => void run()} style={{ width: '100%' }}>
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
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={buildGraph}>
        <RunPanel />
      </XenolithGraph>
    </DemoStage>
  )
}
