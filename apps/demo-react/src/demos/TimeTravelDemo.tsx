import { useEffect, useMemo, useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton, useEditor } from '@xenolith/react'
import { StepDebugger, type StepRecord, type XenolithEditor, type StepExecutor } from '@xenolith/editor'
import type { Node, NodeId, NodeSchema } from '@xenolith/core'
import { DemoStage } from '../Layout.js'

// Time-travel debugger: auto-run the StepDebugger to completion, then let the user SCRUB
// through history with a slider. As the slider moves, each node up to index N lights as 'ok'
// and node-at-N pulses 'running'; the inspector shows that step's inputs/outputs. Same core
// (StepDebugger) — purely a UI projection over `dbg.history`.

const SCHEMAS: NodeSchema[] = [
  { type: 'Const', title: 'Const', category: 'data',
    pins: [{ kind: 'data', direction: 'out', type: 'number', label: 'Out' }],
    widgets: [{ id: 'value', key: 'value', type: 'number', label: 'value', min: -999, max: 999, step: 1 }] },
  { type: 'Add', title: 'Add', category: 'logic',
    pins: [
      { kind: 'data', direction: 'in', type: 'number', label: 'a' },
      { kind: 'data', direction: 'in', type: 'number', label: 'b' },
      { kind: 'data', direction: 'out', type: 'number', label: 'sum' },
    ] },
  { type: 'Multiply', title: 'Multiply', category: 'logic',
    pins: [
      { kind: 'data', direction: 'in', type: 'number', label: 'a' },
      { kind: 'data', direction: 'in', type: 'number', label: 'b' },
      { kind: 'data', direction: 'out', type: 'number', label: 'product' },
    ] },
  { type: 'Display', title: 'Display', category: 'utility',
    pins: [{ kind: 'data', direction: 'in', type: 'number', label: 'In' }] },
]

const executor: StepExecutor = ({ node, inputs }) => {
  if (node.type === 'Const') return new Map([[node.pins[0]!.id, Number((node.state as { value?: number }).value ?? 0)]])
  if (node.type === 'Add' || node.type === 'Multiply') {
    const vals = [...inputs.values()].map(Number)
    const r = node.type === 'Add' ? vals.reduce((s, v) => s + v, 0) : vals.reduce((s, v) => s * v, 1)
    return new Map([[node.pins.find((p) => p.direction === 'out')!.id, r]])
  }
  return new Map()
}

function build(editor: XenolithEditor): void {
  for (const s of SCHEMAS) editor.registry.register(s)
  const a = editor.insertNode('Const',    { x: 0,    y: 0 })!
  const b = editor.insertNode('Const',    { x: 0,    y: 140 })!
  const c = editor.insertNode('Const',    { x: 0,    y: 280 })!
  const add = editor.insertNode('Add',      { x: 320, y: 60 })!
  const mul = editor.insertNode('Multiply', { x: 640, y: 160 })!
  const out = editor.insertNode('Display',  { x: 960, y: 160 })!
  editor.setWidgetValue(a.id, 'value', 2)
  editor.setWidgetValue(b.id, 'value', 3)
  editor.setWidgetValue(c.id, 'value', 4)
  const o0 = (n: typeof a) => n.pins.find((p) => p.direction === 'out')!.id
  const iAt = (n: typeof add, i: number) => n.pins.filter((p) => p.direction === 'in')[i]!.id
  editor.addEdge({ id: crypto.randomUUID(), from: { node: a.id,   pin: o0(a) },   to: { node: add.id, pin: iAt(add, 0) } } as never)
  editor.addEdge({ id: crypto.randomUUID(), from: { node: b.id,   pin: o0(b) },   to: { node: add.id, pin: iAt(add, 1) } } as never)
  editor.addEdge({ id: crypto.randomUUID(), from: { node: add.id, pin: o0(add) }, to: { node: mul.id, pin: iAt(mul, 0) } } as never)
  editor.addEdge({ id: crypto.randomUUID(), from: { node: c.id,   pin: o0(c) },   to: { node: mul.id, pin: iAt(mul, 1) } } as never)
  editor.addEdge({ id: crypto.randomUUID(), from: { node: mul.id, pin: o0(mul) }, to: { node: out.id, pin: iAt(out, 0) } } as never)
  editor.fitView({ padding: 80 })
}

function ScrubPanel() {
  const editor = useEditor()
  const debuggerRef = useRef<StepDebugger | null>(null)
  const [history, setHistory] = useState<StepRecord[]>([])
  const [scrub, setScrub] = useState(0)
  const [playing, setPlaying] = useState(false)

  // Construct + auto-run the debugger once per editor instance.
  useEffect(() => {
    let cancelled = false
    const dbg = new StepDebugger(editor, executor)
    debuggerRef.current = dbg
    ;(async () => {
      await dbg.start()
      await dbg.continue()
      if (cancelled) return
      setHistory([...dbg.history])
      setScrub(dbg.history.length)
      ;(window as unknown as { __xenoTimeTravel?: { editor: XenolithEditor; debugger: StepDebugger; nodeStatuses: Record<string, string> } }).__xenoTimeTravel = {
        editor, debugger: dbg, nodeStatuses: {},
      }
    })()
    return () => {
      cancelled = true
      debuggerRef.current = null
      ;(window as unknown as { __xenoTimeTravel?: unknown }).__xenoTimeTravel = undefined
    }
  }, [editor])

  // Project the scrubber value onto the editor's node statuses: 0..scrub-1 → 'ok',
  // scrub-1 → 'running' (the inspected step). Past `scrub`: 'idle'.
  useEffect(() => {
    if (history.length === 0) return
    const statuses: Record<string, string> = {}
    const allIds = new Set<string>()
    for (const r of history) allIds.add(String(r.nodeId))
    for (const id of allIds) { editor.setNodeStatus(id as NodeId, 'idle') }
    for (let i = 0; i < Math.min(scrub, history.length); i++) {
      const id = history[i]!.nodeId
      const s = i === scrub - 1 ? 'running' : 'ok'
      editor.setNodeStatus(id, s)
      statuses[String(id)] = s
    }
    const w = (window as unknown as { __xenoTimeTravel?: { nodeStatuses: Record<string, string> } }).__xenoTimeTravel
    if (w) w.nodeStatuses = statuses
  }, [editor, scrub, history])

  // Auto-play through history at 600ms/step.
  useEffect(() => {
    if (!playing) return
    if (scrub >= history.length) { setPlaying(false); return }
    const t = setTimeout(() => setScrub((s) => Math.min(s + 1, history.length)), 600)
    return () => clearTimeout(t)
  }, [playing, scrub, history])

  const current = scrub > 0 ? history[scrub - 1] : null
  const node = useMemo<Node | undefined>(() => {
    if (!current) return undefined
    return editor.graph.getNode(current.nodeId) as Node | undefined
  }, [editor, current])

  return (
    <>
      <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360, padding: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--xeno-text)', fontWeight: 600 }}>Time-travel scrubber</div>
        <div style={{ fontSize: 11, color: 'var(--xeno-muted)', lineHeight: 1.4 }}>
          The graph ran <strong>(2 + 3) × 4 = 20</strong> from start to finish. Drag the slider
          to rewind through {history.length} steps — green = done, yellow = the step you're
          inspecting. Press Play to auto-advance.
        </div>
        <input
          type="range" min={0} max={history.length} value={scrub} step={1}
          onChange={(e) => { setPlaying(false); setScrub(Number(e.target.value)) }}
          data-testid="scrub"
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: 'var(--xeno-text)' }}>
          <XenolithButton active={playing} onClick={() => { if (scrub >= history.length) setScrub(0); setPlaying(!playing) }}>
            {playing ? '⏸ Pause' : '▶ Play'}
          </XenolithButton>
          <XenolithButton onClick={() => { setPlaying(false); setScrub(0) }}>⟲ Reset</XenolithButton>
          <span style={{ marginLeft: 'auto', color: 'var(--xeno-muted)' }}>{scrub}/{history.length}</span>
        </div>
      </XenolithPanel>

      {current && node && (
        <XenolithPanel position="top-right" style={{ minWidth: 240, maxWidth: 320, padding: 10 }}>
          <div style={{ fontSize: 10, color: 'var(--xeno-muted)', textTransform: 'uppercase' }}>Step {scrub}</div>
          <div style={{ fontSize: 14, color: 'var(--xeno-text)', fontWeight: 600 }}>{node.type}</div>
          <div style={{ fontSize: 10, color: 'var(--xeno-muted)', marginTop: 8 }}>Outputs</div>
          {[...current.outputs.entries()].map(([k, v], i) => {
            const pin = node.pins.find((p) => p.id === k)
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0' }}>
                <span style={{ color: 'var(--xeno-muted)' }}>{pin?.label ?? k}</span>
                <span style={{ color: 'var(--xeno-text)', fontFamily: 'ui-monospace, monospace' }}>{JSON.stringify(v)}</span>
              </div>
            )
          })}
          <div style={{ fontSize: 10, color: 'var(--xeno-muted)', marginTop: 6 }}>{current.durationMs.toFixed(2)}ms</div>
        </XenolithPanel>
      )}
    </>
  )
}

export function TimeTravelDemo() {
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={build}>
        <ScrubPanel />
      </XenolithGraph>
    </DemoStage>
  )
}
