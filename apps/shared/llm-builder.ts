// LLM workflow builder (a prettier LangFlow) built ON the graph: Input → Prompt → Model → Output.
// The graph itself is DATA (llm-builder.json, loaded with editor.loadJSON) — only the two custom
// widget renderers ('prompt-edit', 'output-view') are framework components the host registers first.
//
// The runner is pure editor API, so it lives here and works on any framework: it walks the graph in
// topological order, feeds each node its upstream outputs, lights the active node (setNodeStatus),
// and streams the completion into the Output node. reachableFrom keeps a disconnected / just-deleted
// node out of the run — it must not light up or be processed.

import { topoOrder, incomers, reachableFrom } from '@xenolith/core'
import type { XenolithEditor, NodeId } from '@xenolith/editor'
import graph from './llm-builder.json'

export interface LLMBuilderHandle {
  /** Walk the active chain and stream the completion into Output. Resolves when the run finishes. */
  run(): Promise<void>
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

export function buildLLMBuilder(editor: XenolithEditor): LLMBuilderHandle {
  editor.loadJSON(graph)
  editor.fitView({ padding: 56, maxZoom: 1 })

  const run = async (): Promise<void> => {
    editor.clearNodeStatuses()
    const inputId = [...editor.graph.nodes()].find((n) => n.type === 'Input')?.id
    const active = inputId ? reachableFrom(editor.graph, inputId) : new Set<NodeId>()
    const { order } = topoOrder(editor.graph)
    const out = new Map<NodeId, string>()
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
  }

  return { run }
}
