import { useEffect, useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton, useEditor } from '@xenolith/react'
import { StepDebugger, type StepRecord, type XenolithEditor, type StepExecutor } from '@xenolith/editor'
import type { Node, NodeId, NodeSchema } from '@xenolith/core'
import { TEMPLATE_INSTANCE_TYPE } from '@xenolith/core'
import { DemoStage } from '../Layout.js'

// Visual stepping debugger for graph execution. Click "Start" → debugger pauses on the first
// node and yellow-rings it. "Step" executes one node and pauses on the next. "Continue" runs
// to the end (or next breakpoint). Click any node while debugging to toggle a breakpoint.
//
// Single chain (a + b) × c piped through an Identity probe → Display. Add + Multiply are
// wrapped in macro "Compute"; Identity is wrapped in template "Probe". The two wrappings
// SHARE a boundary (Multiply.product → Identity.in) — this used to trigger an editor bug
// in #setMacroCollapsed (stale proxyMap.externalNode); the fix resolves the current external
// endpoint at toggle time. Toggle the macro to step Add + Multiply individually or as one Macro.
//
// Canon: graph SETUP lives in onReady (buildDemoGraph). Everything else — debugger instance,
// breakpoint DOM dots, animated-edge tracking, status mirrors, editor.on subscriptions — lives
// in DebuggerPanel via useEditor().

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
  { type: 'Identity', title: 'Identity', category: 'utility',
    pins: [
      { kind: 'data', direction: 'in', type: 'number', label: 'in' },
      { kind: 'data', direction: 'out', type: 'number', label: 'out' },
    ] },
  { type: 'Display', title: 'Display', category: 'utility',
    pins: [{ kind: 'data', direction: 'in', type: 'number', label: 'In' }] },
]

function evalNode(node: Node, inputs: Map<string, unknown>): Map<string, unknown> {
  if (node.type === 'Const') {
    return new Map([[node.pins[0]!.id, Number((node.state as { value?: number }).value ?? 0)]])
  }
  if (node.type === 'Add' || node.type === 'Multiply') {
    const vals = [...inputs.values()].map(Number)
    const r = node.type === 'Add' ? vals.reduce((s, v) => s + v, 0) : vals.reduce((s, v) => s * v, 1)
    return new Map([[node.pins.find((p) => p.direction === 'out')!.id, r]])
  }
  if (node.type === 'Identity') {
    const v = [...inputs.values()][0]
    const outPin = node.pins.find((p) => p.direction === 'out')
    if (outPin && v !== undefined) return new Map([[outPin.id, v]])
  }
  return new Map()
}

/** Build the executor as a closure over `editor` so the Macro case can look up its members.
 *  Two execution modes:
 *   - COLLAPSED macro: members are hidden, macro is the only step → walk the sub-graph
 *     internally and surface the last member's output on the macro's proxy out-pin.
 *   - EXPANDED macro: members already executed individually (with real inputs); use peek()
 *     to surface the LAST member's outputs as the macro's row — no double execution, no
 *     fake inputs, the trace just shows "Compute = 20" right after its internals. */
function makeExecutor(editor: XenolithEditor): StepExecutor {
  return ({ node, inputs, peek }) => {
    if (node.type === 'Macro') {
      const state = node.state as { collapsed?: boolean; members?: NodeId[] }
      const memberIds = state.members ?? []
      const lastId = memberIds[memberIds.length - 1]
      if (!state.collapsed) {
        const out = lastId ? peek(lastId as NodeId) : undefined
        if (!out) return new Map()
        const macroOutPin = node.pins.find((p) => p.direction === 'out')
        const value = [...out.values()][0]
        if (macroOutPin && value !== undefined) return new Map([[macroOutPin.id, value]])
        return out
      }
      const subValues = new Map<string, Map<string, unknown>>()
      for (const mid of memberIds) {
        const member = editor.graph.getNode(mid as NodeId)
        if (!member) continue
        const memberInputs = new Map<string, unknown>()
        for (const e of editor.graph.edges()) {
          if (e.to.node !== mid) continue
          if (memberIds.includes(e.from.node as NodeId)) {
            const upstream = subValues.get(e.from.node)
            const v = upstream?.get(e.from.pin as string)
            if (v !== undefined) memberInputs.set(e.to.pin as string, v)
          } else {
            const v = [...inputs.values()].shift()
            if (v !== undefined) memberInputs.set(e.to.pin as string, v)
          }
        }
        subValues.set(mid, evalNode(member as Node, memberInputs))
      }
      const lastOut = lastId ? subValues.get(lastId) : null
      const macroOutPin = node.pins.find((p) => p.direction === 'out')
      if (!macroOutPin || !lastOut) return new Map()
      const value = [...lastOut.values()][0]
      return new Map([[macroOutPin.id, value]])
    }
    if (node.type === TEMPLATE_INSTANCE_TYPE) {
      const v = [...inputs.values()][0]
      const outPin = node.pins.find((p) => p.direction === 'out')
      if (outPin && v !== undefined) return new Map([[outPin.id, v]])
      return new Map()
    }
    if (node.type === 'Display') return new Map()
    return evalNode(node, inputs)
  }
}

function buildDemoGraph(editor: XenolithEditor): void {
  for (const s of SCHEMAS) editor.registry.register(s)
  const a   = editor.insertNode('Const',    { x: 0,   y: 0 })!
  const b   = editor.insertNode('Const',    { x: 0,   y: 140 })!
  const c   = editor.insertNode('Const',    { x: 0,   y: 280 })!
  const add = editor.insertNode('Add',      { x: 320, y: 60 })!
  const mul = editor.insertNode('Multiply', { x: 640, y: 160 })!
  const idn = editor.insertNode('Identity', { x: 880, y: 160 })!
  const out = editor.insertNode('Display',  { x: 1100, y: 160 })!
  editor.setWidgetValue(a.id, 'value', 2)
  editor.setWidgetValue(b.id, 'value', 3)
  editor.setWidgetValue(c.id, 'value', 4)
  const out0 = (n: typeof a) => n.pins.find((p) => p.direction === 'out')!.id
  const inAt = (n: typeof add, i: number) => n.pins.filter((p) => p.direction === 'in')[i]!.id
  editor.addEdge({ id: crypto.randomUUID(), from: { node: a.id,   pin: out0(a) },   to: { node: add.id, pin: inAt(add, 0) } } as never)
  editor.addEdge({ id: crypto.randomUUID(), from: { node: b.id,   pin: out0(b) },   to: { node: add.id, pin: inAt(add, 1) } } as never)
  editor.addEdge({ id: crypto.randomUUID(), from: { node: add.id, pin: out0(add) }, to: { node: mul.id, pin: inAt(mul, 0) } } as never)
  editor.addEdge({ id: crypto.randomUUID(), from: { node: c.id,   pin: out0(c) },   to: { node: mul.id, pin: inAt(mul, 1) } } as never)
  editor.addEdge({ id: crypto.randomUUID(), from: { node: mul.id, pin: out0(mul) }, to: { node: idn.id, pin: inAt(idn, 0) } } as never)
  editor.addEdge({ id: crypto.randomUUID(), from: { node: idn.id, pin: out0(idn) }, to: { node: out.id, pin: inAt(out, 0) } } as never)
  editor.createMacroFromSelection([add.id, mul.id], 'Compute')
  editor.createTemplateFromSelection([idn.id], 'Probe')
  editor.fitView({ padding: 80 })
}

function findMacroId(editor: XenolithEditor): NodeId | null {
  for (const n of editor.graph.nodes()) if (n.type === 'Macro') return n.id
  return null
}

interface PausedInfo { nodeType: string; nodeId: string; inputs: Array<[string, unknown]> }

function DebuggerPanel() {
  const editor = useEditor()
  const debuggerRef = useRef<StepDebugger | null>(null)
  const macroIdRef = useRef<NodeId | null>(null)
  const breakpointDotsRef = useRef<Map<string, HTMLDivElement>>(new Map())
  const animatedEdgesRef = useRef<Set<string>>(new Set())
  const [status, setStatus] = useState<'idle' | 'paused' | 'running' | 'finished' | 'error'>('idle')
  const [paused, setPaused] = useState<PausedInfo | null>(null)
  const [history, setHistory] = useState<StepRecord[]>([])
  const [breakpoints, setBreakpoints] = useState<Set<string>>(new Set())
  const [macroExpanded, setMacroExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [planned, setPlanned] = useState<string[]>([])

  const setNodeStatus = (id: NodeId, s: 'idle' | 'running' | 'ok' | 'error'): void => {
    editor.setNodeStatus(id, s)
    const map = ((window as unknown as { __xenoNodeStatus?: Record<string, string> }).__xenoNodeStatus ??= {})
    if (s === 'idle') delete map[String(id)]
    else map[String(id)] = s
  }

  useEffect(() => {
    const macroId = findMacroId(editor)
    macroIdRef.current = macroId
    const dbg = new StepDebugger(editor, makeExecutor(editor))
    debuggerRef.current = dbg
    // Test surface — Playwright reads/drives the debugger via this handle.
    ;(window as unknown as { __xenoDebug?: { editor: XenolithEditor; debugger: StepDebugger; macroId: NodeId | null } }).__xenoDebug = {
      editor, debugger: dbg, macroId,
    }

    const offs: Array<() => void> = []

    dbg.on('paused', ({ nodeId, node, inputs }) => {
      setNodeStatus(nodeId, 'running')
      clearAnimatedEdges(editor, animatedEdgesRef.current)
      for (const e of editor.graph.edges()) {
        if (e.to.node !== nodeId) continue
        editor.setEdgeOptions(e.id, { animated: true })
        animatedEdgesRef.current.add(String(e.id))
      }
      syncAnimatedMirror(animatedEdgesRef.current)
      setPaused({
        nodeType: node.type,
        nodeId,
        inputs: [...inputs.entries()].map(([pinId, v]) => {
          const pin = node.pins.find((p) => p.id === pinId)
          return [pin?.label ?? pinId, v]
        }),
      })
      setStatus('paused')
    })
    dbg.on('stepped', (r) => {
      setNodeStatus(r.nodeId, 'ok')
      for (const n of editor.graph.nodes()) {
        if (n.type !== 'Macro') continue
        const members = (((n.state ?? {}) as { members?: string[] }).members ?? []) as string[]
        if (members.length === 0) continue
        if (!members.includes(String(r.nodeId))) continue
        const statuses = (window as unknown as { __xenoNodeStatus?: Record<string, string> }).__xenoNodeStatus ?? {}
        const allOk = members.every((m) => statuses[m] === 'ok')
        if (allOk) setNodeStatus(n.id, 'ok')
      }
      setHistory([...dbg.history])
    })
    dbg.on('finished', () => { setStatus('finished'); setPaused(null); clearAnimatedEdges(editor, animatedEdgesRef.current) })
    dbg.on('error', ({ nodeId }) => { setNodeStatus(nodeId, 'error'); setStatus('error'); clearAnimatedEdges(editor, animatedEdgesRef.current) })

    offs.push(editor.on('node:click', ({ nodeId }) => {
      const d = debuggerRef.current
      if (!d || d.status === 'idle' || d.status === 'finished') return
      const isOn = d.toggleBreakpoint(nodeId)
      if (isOn) addBreakpointDot(editor, breakpointDotsRef.current, nodeId)
      else removeBreakpointDot(breakpointDotsRef.current, nodeId)
      setBreakpoints(new Set(d.breakpoints))
    }))
    offs.push(editor.on('viewport:changed', () => repositionBreakpointDots(editor, breakpointDotsRef.current)))
    offs.push(editor.on('node:moved', () => repositionBreakpointDots(editor, breakpointDotsRef.current)))

    return () => {
      for (const off of offs) off()
      dbg.stop()
      clearAnimatedEdges(editor, animatedEdgesRef.current)
      for (const [, dot] of breakpointDotsRef.current) dot.remove()
      breakpointDotsRef.current.clear()
      debuggerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  const clearStatuses = (): void => {
    for (const n of editor.graph.nodes()) setNodeStatus(n.id, 'idle')
    for (const id of breakpoints) setNodeStatus(id as never, 'error')
  }

  const run = async (fn: () => Promise<void>): Promise<void> => {
    if (busy) return
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }

  const start = (): Promise<void> => run(async () => {
    clearStatuses()
    setHistory([])
    setPaused(null)
    setStatus('running')
    await debuggerRef.current!.start()
    setPlanned(debuggerRef.current!.order.map((id) => {
      const n = editor.graph.getNode(id as never)
      return n ? `${n.type}` : String(id).slice(0, 6)
    }))
  })
  const step = (): Promise<void> => run(async () => { await debuggerRef.current!.step() })
  const cont = (): Promise<void> => run(async () => { setStatus('running'); await debuggerRef.current!.continue() })
  const stop = (): void => {
    debuggerRef.current!.stop()
    setStatus('idle')
    setPaused(null)
    setHistory([])
    setPlanned([])
    clearStatuses()
  }

  const toggleMacro = async (): Promise<void> => {
    const id = macroIdRef.current, dbg = debuggerRef.current
    if (!id || !dbg) return
    const wasActive = dbg.status === 'paused' || dbg.status === 'running'
    const visited = new Set<string>(dbg.history.map((r) => String(r.nodeId)))
    const macroMembers = ((editor.graph.getNode(id)?.state as { members?: string[] } | undefined)?.members ?? [])
    if (macroExpanded) {
      if (macroMembers.length > 0 && macroMembers.every((m) => visited.has(String(m)))) visited.add(String(id))
    } else {
      visited.delete(String(id))
    }
    if (!wasActive) dbg.stop()
    if (macroExpanded) editor.collapseMacro(id)
    else editor.expandMacro(id)
    setMacroExpanded(!macroExpanded)
    if (!wasActive) {
      setStatus('idle'); setHistory([]); setPaused(null); setPlanned([])
      clearStatuses()
      return
    }
    await dbg.start()
    while (dbg.status === 'paused' && dbg.currentNodeId && visited.has(String(dbg.currentNodeId))) {
      dbg.advance()
    }
    setStatus(dbg.status as never)
    setPlanned(dbg.order.map((nid) => editor.graph.getNode(nid as never)?.type ?? '?'))
  }

  const canStart    = status === 'idle' || status === 'finished' || status === 'error'
  const canStep     = status === 'paused'
  const canContinue = status === 'paused'
  const canStop     = status !== 'idle'

  return (
    <>
      <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 320, padding: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={dotStyle(status)} />
          <strong style={{ fontSize: 12, color: 'var(--xeno-text)' }}>Debugger {statusLabel(status)}</strong>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <XenolithButton active={canStart} disabled={!canStart || busy} onClick={() => void start()}>▶ Start</XenolithButton>
          <XenolithButton disabled={!canStep || busy} onClick={() => void step()}>⤵ Step</XenolithButton>
          <XenolithButton disabled={!canContinue || busy} onClick={() => void cont()}>⏩ Continue</XenolithButton>
          <XenolithButton disabled={!canStop || busy} onClick={stop}>■ Stop</XenolithButton>
        </div>
        <XenolithButton onClick={toggleMacro} disabled={busy}>
          {macroExpanded ? '⟲ Collapse macro' : '⤢ Expand macro'}
        </XenolithButton>
        <div style={hintStyle}>
          Graph: <strong>(2 + 3) × 4 = 20</strong> piped through a template-wrapped Identity
          into Display. Add + Multiply are inside macro <em>Compute</em>; Identity is inside
          template <em>Probe</em>. Toggle the macro to step its members individually. Templates
          are always one step. Click any node while debugging to toggle a breakpoint (red).
          Yellow = paused, green = executed.
        </div>
      </XenolithPanel>

      {paused && (
        <XenolithPanel position="top-right" style={{ minWidth: 240, maxWidth: 320, padding: 10 }}>
          <div style={{ fontSize: 10, color: 'var(--xeno-muted)', textTransform: 'uppercase', letterSpacing: 0.08 }}>Paused on</div>
          <div style={{ fontSize: 14, color: 'var(--xeno-text)', fontWeight: 600 }}>{paused.nodeType}</div>
          <div style={{ fontSize: 10, color: 'var(--xeno-muted)', marginTop: 8 }}>Inputs</div>
          {paused.inputs.length === 0
            ? <div style={mutedRow}>— (no incoming values)</div>
            : paused.inputs.map(([k, v], i) => (
                <div key={i} style={kvRow}>
                  <span style={{ color: 'var(--xeno-muted)' }}>{k}</span>
                  <span style={{ color: 'var(--xeno-text)', fontFamily: 'ui-monospace, monospace' }}>{JSON.stringify(v)}</span>
                </div>
              ))}
        </XenolithPanel>
      )}

      <XenolithPanel position="bottom-left" style={{ minWidth: 280, maxWidth: 360, maxHeight: 260, padding: 8, overflow: 'auto' }}>
        {planned.length > 0 && (
          <>
            <div style={{ fontSize: 10, color: 'var(--xeno-muted)', marginBottom: 4 }}>Planned walk ({planned.length} steps)</div>
            <div style={{ fontSize: 10, color: 'var(--xeno-text)', fontFamily: 'ui-monospace, monospace', marginBottom: 8, lineHeight: 1.5 }}>
              {planned.map((t, i) => <span key={i}>{i + 1}. {t}{i < planned.length - 1 ? ' → ' : ''}</span>)}
            </div>
          </>
        )}
        <div style={{ fontSize: 10, color: 'var(--xeno-muted)', marginBottom: 4 }}>Trace</div>
        {history.length === 0
          ? <div style={mutedRow}>Press <strong>▶ Start</strong>, then <strong>⤵ Step</strong>.</div>
          : history.map((r, i) => (
              <div key={i} style={traceRow}>
                <span style={{ color: 'var(--xeno-accent, #FCB400)' }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ color: 'var(--xeno-text)' }}>{r.type}</span>
                <span style={{ color: 'var(--xeno-muted)' }}>{r.durationMs.toFixed(2)}ms</span>
                <span style={{ color: 'var(--xeno-text)', fontFamily: 'ui-monospace, monospace' }}>
                  {[...r.outputs.values()].map((v) => JSON.stringify(v)).join(', ') || '—'}
                </span>
              </div>
            ))}
      </XenolithPanel>
    </>
  )
}

/** Showcase: a visual stepping debugger over an actual graph computation. */
export function StepDebuggerDemo() {
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={buildDemoGraph}>
        <DebuggerPanel />
      </XenolithGraph>
    </DemoStage>
  )
}

function clearAnimatedEdges(editor: XenolithEditor, animated: Set<string>): void {
  for (const id of animated) editor.setEdgeOptions(id as never, { animated: false })
  animated.clear()
  syncAnimatedMirror(animated)
}
function syncAnimatedMirror(animated: Set<string>): void {
  ;(window as unknown as { __xenoAnimatedEdges?: string[] }).__xenoAnimatedEdges = [...animated]
}

function addBreakpointDot(editor: XenolithEditor, store: Map<string, HTMLDivElement>, nodeId: string): void {
  if (store.has(nodeId)) return
  const dot = document.createElement('div')
  Object.assign(dot.style, {
    position: 'absolute', width: '10px', height: '10px', borderRadius: '10px',
    background: '#ff3b3b', boxShadow: '0 0 6px #ff3b3baa', pointerEvents: 'none',
    transform: 'translate(-50%, -50%)', zIndex: '20',
  } as Partial<CSSStyleDeclaration>)
  dot.setAttribute('data-breakpoint', nodeId)
  editor.overlayRoot.appendChild(dot)
  store.set(nodeId, dot)
  positionBreakpointDot(editor, dot, nodeId)
}
function removeBreakpointDot(store: Map<string, HTMLDivElement>, nodeId: string): void {
  const el = store.get(nodeId)
  if (!el) return
  el.remove()
  store.delete(nodeId)
}
function positionBreakpointDot(editor: XenolithEditor, dot: HTMLDivElement, nodeId: string): void {
  const node = editor.graph.getNode(nodeId as never)
  if (!node) { dot.style.display = 'none'; return }
  const p = editor.worldToScreen({ x: node.position.x, y: node.position.y })
  dot.style.left = `${p.x}px`
  dot.style.top = `${p.y}px`
  dot.style.display = ''
}
function repositionBreakpointDots(editor: XenolithEditor, store: Map<string, HTMLDivElement>): void {
  for (const [id, dot] of store) positionBreakpointDot(editor, dot, id)
}

const dotStyle = (s: string): React.CSSProperties => ({
  width: 8, height: 8, borderRadius: 8,
  background: s === 'paused' ? '#fcb400' : s === 'running' ? '#3ddc97' : s === 'error' ? '#e25b5b' : s === 'finished' ? '#5b8def' : '#666',
  boxShadow: s === 'paused' ? '0 0 8px #fcb40088' : undefined,
})
const statusLabel = (s: string): string => ({ idle: 'idle', paused: 'paused', running: 'running…', finished: 'finished', error: 'error' } as Record<string, string>)[s] ?? s
const hintStyle: React.CSSProperties = { fontSize: 11, color: 'var(--xeno-muted)', lineHeight: 1.4 }
const mutedRow: React.CSSProperties = { fontSize: 11, color: 'var(--xeno-muted)' }
const kvRow: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0' }
const traceRow: React.CSSProperties = { display: 'grid', gridTemplateColumns: '24px 1fr auto auto', gap: 8, fontSize: 11, padding: '2px 0', alignItems: 'baseline' }
