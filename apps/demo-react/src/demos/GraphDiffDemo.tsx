import { useCallback, useEffect, useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel, useEditor } from '@xenolith/react'
import { diffGraphs, type XenolithEditor, type GraphDiff } from '@xenolith/editor'
import type { NodeSchema } from '@xenolith/core'

// PR-review style diff. BEFORE pane is just the old graph — no highlights, no legend.
// AFTER pane carries the entire diff story:
//   - added nodes   → static GREEN ring (setNodeStatus 'ok')
//   - modified      → static YELLOW DOM ring (the editor's 'running' status pulses, which would
//     read as "this is currently running" — wrong semantics for a diff. Use a DOM overlay so
//     the ring is rock-solid.)
//   - removed       → red GHOST rectangle in AFTER at the node's BEFORE position, so the
//     reader can see exactly where the deletion happened in the old layout.
// Both panes are READ-ONLY (no pan, no zoom, no drag) — diff is for inspection only.
//
// Cross-editor data (the diff) lives at the parent — there's no canonical way around that.
// Each pane is its own <XenolithGraph>; each owns its build + read-only setup via an in-editor
// child reading `useEditor()`. They call up to the parent so the diff can be computed once
// BOTH editors are mounted.

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
  // A tiny throwaway node type only PREV uses so the diff has a real `removed` to highlight.
  { type: 'Probe', title: 'Probe', category: 'utility',
    pins: [{ kind: 'data', direction: 'in', type: 'number', label: 'In' }] },
]

interface Built {
  ids: Record<string, string>
  meta: Record<string, { key: string }>
  /** PREV-pane only: positions of every node, keyed by the stable `key` so the AFTER pane can
   *  paint ghost rectangles for removed-in-AFTER nodes at the BEFORE coordinates. */
  positions: Record<string, { x: number; y: number; w: number; h: number }>
  /** PREV-pane only: node type by key, so removed-ghost labels can say "— Probe removed —" */
  typeByKey: Record<string, string>
}

function buildPrev(editor: XenolithEditor): Built {
  for (const s of SCHEMAS) editor.registry.register(s)
  const a    = editor.insertNode('Const',   { x: 0,   y: 0   })!
  const b    = editor.insertNode('Const',   { x: 0,   y: 140 })!
  const add  = editor.insertNode('Add',     { x: 320, y: 60  })!
  const out  = editor.insertNode('Display', { x: 640, y: 60  })!
  const dbg  = editor.insertNode('Probe',   { x: 640, y: 220 })! // only in PREV → removed in NEXT
  editor.setWidgetValue(a.id, 'value', 2)
  editor.setWidgetValue(b.id, 'value', 3)
  const o = (n: typeof a): string => n.pins.find((p) => p.direction === 'out')!.id
  const iAt = (n: typeof add, i: number): string => n.pins.filter((p) => p.direction === 'in')[i]!.id
  editor.addEdge({ id: crypto.randomUUID(), from: { node: a.id, pin: o(a) }, to: { node: add.id, pin: iAt(add, 0) } } as never)
  editor.addEdge({ id: crypto.randomUUID(), from: { node: b.id, pin: o(b) }, to: { node: add.id, pin: iAt(add, 1) } } as never)
  editor.addEdge({ id: crypto.randomUUID(), from: { node: add.id, pin: o(add) }, to: { node: out.id, pin: iAt(out, 0) } } as never)
  editor.addEdge({ id: crypto.randomUUID(), from: { node: add.id, pin: o(add) }, to: { node: dbg.id, pin: iAt(dbg, 0) } } as never)
  editor.fitView({ padding: 60 })
  const positions: Built['positions'] = {}
  for (const n of editor.graph.nodes()) {
    positions[String(n.id)] = { x: n.position.x, y: n.position.y, w: n.size?.x ?? 200, h: n.size?.y ?? 80 }
  }
  return {
    ids: { a: String(a.id), b: String(b.id), add: String(add.id), out: String(out.id), dbg: String(dbg.id) },
    meta: {
      [a.id]: { key: 'a' }, [b.id]: { key: 'b' }, [add.id]: { key: 'add' },
      [out.id]: { key: 'out' }, [dbg.id]: { key: 'dbg' },
    },
    positions: {
      a: positions[String(a.id)]!, b: positions[String(b.id)]!, add: positions[String(add.id)]!,
      out: positions[String(out.id)]!, dbg: positions[String(dbg.id)]!,
    },
    typeByKey: { a: 'Const', b: 'Const', add: 'Add', out: 'Display', dbg: 'Probe' },
  }
}

function buildNext(editor: XenolithEditor): Built {
  for (const s of SCHEMAS) editor.registry.register(s)
  const a     = editor.insertNode('Const',    { x: 0,   y: 0   })!
  const b     = editor.insertNode('Const',    { x: 0,   y: 140 })!
  const add   = editor.insertNode('Add',      { x: 320, y: 60  })!
  const extra = editor.insertNode('Const',    { x: 320, y: 280 })!
  const mul   = editor.insertNode('Multiply', { x: 560, y: 160 })!
  const out   = editor.insertNode('Display',  { x: 880, y: 160 })!
  editor.setWidgetValue(a.id, 'value', 2)
  editor.setWidgetValue(b.id, 'value', 7)     // modified (was 3)
  editor.setWidgetValue(extra.id, 'value', 4)
  const o = (n: typeof a): string => n.pins.find((p) => p.direction === 'out')!.id
  const iAt = (n: typeof add, i: number): string => n.pins.filter((p) => p.direction === 'in')[i]!.id
  editor.addEdge({ id: crypto.randomUUID(), from: { node: a.id, pin: o(a) },     to: { node: add.id, pin: iAt(add, 0) } } as never)
  editor.addEdge({ id: crypto.randomUUID(), from: { node: b.id, pin: o(b) },     to: { node: add.id, pin: iAt(add, 1) } } as never)
  editor.addEdge({ id: crypto.randomUUID(), from: { node: add.id, pin: o(add) }, to: { node: mul.id, pin: iAt(mul, 0) } } as never)
  editor.addEdge({ id: crypto.randomUUID(), from: { node: extra.id, pin: o(extra) }, to: { node: mul.id, pin: iAt(mul, 1) } } as never)
  editor.addEdge({ id: crypto.randomUUID(), from: { node: mul.id, pin: o(mul) }, to: { node: out.id, pin: iAt(out, 0) } } as never)
  editor.fitView({ padding: 60 })
  const positions: Built['positions'] = {}
  for (const n of editor.graph.nodes()) {
    positions[String(n.id)] = { x: n.position.x, y: n.position.y, w: n.size?.x ?? 200, h: n.size?.y ?? 80 }
  }
  return {
    ids: { a: String(a.id), b: String(b.id), add: String(add.id), mul: String(mul.id), extra: String(extra.id), out: String(out.id) },
    meta: {
      [a.id]: { key: 'a' }, [b.id]: { key: 'b' }, [add.id]: { key: 'add' },
      [mul.id]: { key: 'mul' }, [extra.id]: { key: 'extra' }, [out.id]: { key: 'out' },
    },
    positions: {
      a: positions[String(a.id)]!, b: positions[String(b.id)]!, add: positions[String(add.id)]!,
      mul: positions[String(mul.id)]!, extra: positions[String(extra.id)]!, out: positions[String(out.id)]!,
    },
    typeByKey: { a: 'Const', b: 'Const', add: 'Add', mul: 'Multiply', extra: 'Const', out: 'Display' },
  }
}

function snapshotWithKeys(editor: XenolithEditor, meta: Record<string, { key: string }>): { nodes: { id: string; type: string; position: { x: number; y: number }; state: Record<string, unknown> }[]; edges: { id: string; from: { node: string; pin: string }; to: { node: string; pin: string } }[] } {
  const nodes = [...editor.graph.nodes()].map((n) => ({
    id: meta[String(n.id)]?.key ?? String(n.id),
    type: n.type,
    position: { x: n.position.x, y: n.position.y },
    state: { ...n.state },
  }))
  const edges = [...editor.graph.edges()].map((e) => {
    const fk = meta[String(e.from.node)]?.key ?? String(e.from.node)
    const tk = meta[String(e.to.node)]?.key ?? String(e.to.node)
    return { id: `${fk}→${tk}`, from: { node: fk, pin: '' }, to: { node: tk, pin: '' } }
  })
  return { nodes, edges }
}

/** Make the editor accept ONLY pan/zoom — every other interaction is blocked.
 *  1) Walk the PIXI scene under stage and set every interactive child's `eventMode='none'`
 *     so hit-testing never lands on a node / pin / edge → drag never even starts. The stage
 *     itself stays interactive, so its own pan/zoom handlers continue to receive events.
 *  2) Belt-and-braces: intercept `commandBus.apply` to drop any mutation command — protects
 *     against future code paths that route around the eventMode trick. */
function makeReadOnly(editor: XenolithEditor): void {
  const blocked = new Set(['MoveNode', 'AddNode', 'RemoveNode', 'ConnectPins', 'DisconnectEdge', 'SetNodeState', 'SetNodePins'])
  const bus = editor.commandBus as unknown as { apply: (cmd: { type: string }) => unknown }
  const orig = bus.apply.bind(bus)
  bus.apply = (cmd) => (blocked.has(cmd.type) ? undefined : orig(cmd))
  const stage = editor.app.stage as unknown as { children?: unknown[] }
  const disable = (c: { eventMode?: string; children?: unknown[] }): void => {
    if (c.eventMode === 'static') c.eventMode = 'none'
    for (const ch of (c.children ?? [])) disable(ch as never)
  }
  for (const ch of (stage.children ?? [])) disable(ch as never)
  // Editor's sync may re-enable node interactivity after future graph changes — repeat on
  // the next few frames so we catch the initial measure pass too.
  let ticks = 0
  const tick = (): void => {
    for (const ch of (stage.children ?? [])) disable(ch as never)
    if (++ticks < 6) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  editor.selection.clear()
}

interface DomOverlayHandles {
  modified: Map<string, HTMLDivElement>
  removed:  Map<string, HTMLDivElement>
}

function reposition(editor: XenolithEditor, handles: DomOverlayHandles, keyToId: Record<string, string>, removedPositions: Record<string, { x: number; y: number; w: number; h: number }>): void {
  for (const [key, el] of handles.modified) {
    const id = keyToId[key]; if (!id) continue
    const n = editor.graph.getNode(id as never); if (!n) continue
    const tl = editor.worldToScreen(n.position)
    const br = editor.worldToScreen({ x: n.position.x + (n.size?.x ?? 200), y: n.position.y + (n.size?.y ?? 80) })
    el.style.left   = `${tl.x - 3}px`
    el.style.top    = `${tl.y - 3}px`
    el.style.width  = `${br.x - tl.x + 6}px`
    el.style.height = `${br.y - tl.y + 6}px`
  }
  for (const [key, el] of handles.removed) {
    const p = removedPositions[key]; if (!p) continue
    const tl = editor.worldToScreen({ x: p.x, y: p.y })
    const br = editor.worldToScreen({ x: p.x + p.w, y: p.y + p.h })
    const wPx = br.x - tl.x
    const hPx = br.y - tl.y
    el.style.left   = `${tl.x}px`
    el.style.top    = `${tl.y}px`
    el.style.width  = `${wPx}px`
    el.style.height = `${hPx}px`
    // Scale the label so it never overflows the small box at zoom-out. Below ~60px wide
    // there isn't room for the type name at all — drop to a single dash.
    const fontPx = Math.max(7, Math.min(12, wPx / 16))
    el.style.fontSize = `${fontPx}px`
    el.style.padding = `${Math.max(2, hPx * 0.1)}px`
    el.style.lineHeight = '1.05'
    el.style.textAlign = 'center'
    if (wPx < 60) el.textContent = '—'
    else el.textContent = el.dataset['fullLabel'] ?? el.textContent ?? ''
  }
}

function paintAfterOverlay(editor: XenolithEditor, diff: GraphDiff, afterIds: Record<string, string>, prevPositions: Record<string, { x: number; y: number; w: number; h: number }>, prevTypes: Record<string, string>): DomOverlayHandles {
  for (const n of editor.graph.nodes()) editor.setNodeStatus(n.id, 'idle')
  for (const k of diff.addedNodes) { const id = afterIds[k]; if (id) editor.setNodeStatus(id as never, 'ok') }
  const handles: DomOverlayHandles = { modified: new Map(), removed: new Map() }
  for (const k of diff.modifiedNodes) {
    const el = document.createElement('div')
    Object.assign(el.style, {
      position: 'absolute', border: '2px solid #fcb400', borderRadius: '10px',
      pointerEvents: 'none', boxShadow: '0 0 0 1px rgba(0,0,0,0.4) inset', zIndex: '20',
    } as Partial<CSSStyleDeclaration>)
    el.setAttribute('data-diff-modified', k)
    editor.overlayRoot.appendChild(el)
    handles.modified.set(k, el)
  }
  for (const k of diff.removedNodes) {
    const el = document.createElement('div')
    Object.assign(el.style, {
      position: 'absolute', border: '2px dashed #ff5b6e', borderRadius: '10px',
      pointerEvents: 'none', background: 'rgba(255,91,110,0.08)', zIndex: '20',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#ff8898', fontSize: '11px', fontFamily: 'ui-monospace, monospace',
      overflow: 'hidden', boxSizing: 'border-box', whiteSpace: 'nowrap',
    } as Partial<CSSStyleDeclaration>)
    el.setAttribute('data-diff-removed', k)
    const fullLabel = `— ${prevTypes[k] ?? 'node'} removed —`
    el.dataset['fullLabel'] = fullLabel
    el.textContent = fullLabel
    editor.overlayRoot.appendChild(el)
    handles.removed.set(k, el)
  }
  reposition(editor, handles, afterIds, prevPositions)
  return handles
}

interface PaneReport { editor: XenolithEditor; built: Built }

function PrevPane({ onReady }: { onReady: (r: PaneReport) => void }) {
  const editor = useEditor()
  useEffect(() => {
    const built = buildPrev(editor)
    onReady({ editor, built })
  }, [editor, onReady])
  return (
    <XenolithPanel position="top-left" style={{ padding: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--xeno-text)', fontWeight: 600 }}>BEFORE</div>
    </XenolithPanel>
  )
}

function NextPane({ onReady, diff }: { onReady: (r: PaneReport) => void; diff: GraphDiff | null }) {
  const editor = useEditor()
  useEffect(() => {
    const built = buildNext(editor)
    onReady({ editor, built })
  }, [editor, onReady])
  return (
    <XenolithPanel position="top-left" style={{ padding: 8 }}>
      <div style={{ fontSize: 12, color: 'var(--xeno-text)', fontWeight: 600 }}>AFTER</div>
      {diff && (
        <div style={legendRow}>
          <span style={swatch('#39d98a')} /> added {diff.addedNodes.size}
          <span style={swatch('#fcb400')} /> modified {diff.modifiedNodes.size}
          <span style={swatch('#ff5b6e')} /> removed {diff.removedNodes.size}
        </div>
      )}
    </XenolithPanel>
  )
}

export function GraphDiffDemo() {
  const prevRef = useRef<PaneReport | null>(null)
  const nextRef = useRef<PaneReport | null>(null)
  const overlayRef = useRef<DomOverlayHandles | null>(null)
  const [diff, setDiff] = useState<GraphDiff | null>(null)

  const finalise = useCallback((): void => {
    const prev = prevRef.current, next = nextRef.current
    if (!prev || !next) return
    makeReadOnly(prev.editor)
    makeReadOnly(next.editor)
    const prevSnap = snapshotWithKeys(prev.editor, prev.built.meta)
    const nextSnap = snapshotWithKeys(next.editor, next.built.meta)
    const d = diffGraphs(prevSnap, nextSnap)
    setDiff(d)
    overlayRef.current = paintAfterOverlay(next.editor, d, next.built.ids, prev.built.positions, prev.built.typeByKey)
    // Clear any auto-selection that came from inserting nodes — the diff is a read-only view,
    // selection rings would be visual noise.
    next.editor.selection.clear()
    const ed = next.editor
    const ids = next.built.ids
    const positions = prev.built.positions
    ed.on('viewport:changed', () => reposition(ed, overlayRef.current!, ids, positions))
    ed.on('node:moved', () => reposition(ed, overlayRef.current!, ids, positions))
    ;(window as unknown as { __xenoGraphDiff?: { diff: GraphDiff; prev: XenolithEditor; next: XenolithEditor } }).__xenoGraphDiff = {
      diff: d, prev: prev.editor, next: next.editor,
    }
  }, [])

  const onPrev = useCallback((r: PaneReport) => { prevRef.current = r; finalise() }, [finalise])
  const onNext = useCallback((r: PaneReport) => { nextRef.current = r; finalise() }, [finalise])

  useEffect(() => () => {
    (window as unknown as { __xenoGraphDiff?: unknown }).__xenoGraphDiff = undefined
    if (overlayRef.current) {
      for (const [, el] of overlayRef.current.modified) el.remove()
      for (const [, el] of overlayRef.current.removed) el.remove()
    }
  }, [])

  return (
    <>
      <div style={paneStyle('left')}>
        <XenolithGraph className="xeno" resizeToWindow={false}>
          <PrevPane onReady={onPrev} />
        </XenolithGraph>
      </div>
      <div style={paneStyle('right')}>
        <XenolithGraph className="xeno" resizeToWindow={false}>
          <NextPane onReady={onNext} diff={diff} />
        </XenolithGraph>
      </div>
    </>
  )
}

const paneStyle = (side: 'left' | 'right'): React.CSSProperties => ({
  position: 'absolute', top: 0, bottom: 0,
  left: side === 'left' ? 0 : '50%', right: side === 'left' ? '50%' : 0,
  borderRight: side === 'left' ? '1px solid var(--xeno-border, #222)' : undefined,
  overflow: 'hidden',
})
const swatch = (color: string): React.CSSProperties => ({ display: 'inline-block', width: 10, height: 10, borderRadius: 10, background: color, margin: '0 6px 0 10px' })
const legendRow: React.CSSProperties = { fontSize: 11, color: 'var(--xeno-muted)', display: 'flex', alignItems: 'center', marginTop: 6 }
