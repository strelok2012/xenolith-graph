import { useEffect, useState } from 'react'
import type { EditorEvents, XenolithEditor, ViewportState, Node, Edge, NodeId, XenolithGraphV1 } from '@xenolith/editor'
import { useXenolithEditor } from './context.js'

/** Subscribe to a set of editor events and recompute a derived value from the editor on each one.
 *  The value is held in state, so its reference is stable between events — safe to use in deps. */
function useEditorSelector<T>(events: ReadonlyArray<keyof EditorEvents>, compute: (e: XenolithEditor) => T, fallback: T): T {
  const editor = useXenolithEditor()
  const [value, setValue] = useState<T>(() => (editor ? compute(editor) : fallback))
  useEffect(() => {
    if (!editor) { setValue(fallback); return }
    const update = (): void => setValue(compute(editor))
    update()
    const offs = events.map((ev) => editor.on(ev, update))
    return () => { for (const off of offs) off() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])
  return value
}

const NODE_EVENTS = ['node:added', 'node:removed', 'node:moved', 'graph:loaded', 'history:changed'] as const
const EDGE_EVENTS = ['edge:connected', 'edge:disconnected', 'node:removed', 'graph:loaded', 'history:changed'] as const
const GRAPH_EVENTS = [
  'node:added', 'node:removed', 'node:moved', 'edge:connected', 'edge:disconnected',
  'widget:changed', 'graph:loaded', 'history:changed',
] as const

/** Live array of nodes; re-renders on add/remove/move, load and undo/redo. */
export function useNodes(): Node[] {
  return useEditorSelector(NODE_EVENTS, (e) => Array.from(e.graph.nodes()) as Node[], [])
}

/** Live array of edges; re-renders on connect/disconnect, node removal, load and undo/redo. */
export function useEdges(): Edge[] {
  return useEditorSelector(EDGE_EVENTS, (e) => Array.from(e.graph.edges()) as Edge[], [])
}

/** Live selection (node ids); re-renders on selection change. */
export function useSelection(): NodeId[] {
  return useEditorSelector(['selection:changed'], (e) => [...e.selection.ids()], [])
}

/** Live viewport (`x`, `y`, `zoom`); re-renders on pan/zoom. */
export function useViewport(): ViewportState {
  return useEditorSelector(['viewport:changed'], (e) => e.viewport, { x: 0, y: 0, zoom: 1 })
}

/** Live serialized graph (xenolith.v1); recomputes on any graph mutation, load and undo/redo. */
export function useGraphJSON(): XenolithGraphV1 | null {
  return useEditorSelector(GRAPH_EVENTS, (e) => e.toJSON(), null)
}
