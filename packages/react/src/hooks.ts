import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { EditorEvents, XenolithEditor, ViewportState, Node, Edge, NodeId, XenolithGraphV1 } from '@xenolith/editor'
import { useXenolithEditor } from './context.js'

// Canonical pattern: subscribe to an external (non-React) mutable store via `useSyncExternalStore`.
// Replaces the prior `useState + useEffect + subscribe` shape, which the React docs flag as the
// anti-pattern it explicitly fixes. See:
//   - https://react.dev/reference/react/useSyncExternalStore
//   - https://www.epicreact.dev/use-sync-external-store-demystified-for-practical-react-development-w5ac0
// Contract: `getSnapshot` MUST return the same reference if the underlying data hasn't changed —
// otherwise React tears down and re-renders forever. We cache by editor identity in a ref and
// only mutate the cache when an editor event actually fires.

function makeEditorStoreHook<T>(
  events: ReadonlyArray<keyof EditorEvents>,
  compute: (editor: XenolithEditor) => T,
  fallback: T,
): () => T {
  return function useEditorStore(): T {
    const editor = useXenolithEditor()
    const cacheRef = useRef<{ editor: XenolithEditor | null; value: T }>({ editor: null, value: fallback })

    const subscribe = useCallback((onChange: () => void) => {
      if (!editor) return () => {}
      // Refresh the cache on subscribe so the first getSnapshot read returns up-to-date data.
      cacheRef.current = { editor, value: compute(editor) }
      // Coalesce a burst of events (e.g. a 1000-node transaction firing node:added 1000×) into
      // ONE recompute + ONE React notification. Without this, the hook re-walks the graph on every
      // event and a `+1000` button costs ~1M ops just for the snapshot, before React even renders.
      let scheduled = false
      const update = (): void => {
        if (scheduled) return
        scheduled = true
        queueMicrotask(() => {
          scheduled = false
          if (cacheRef.current.editor !== editor) return // unsubscribed mid-flight
          cacheRef.current = { editor, value: compute(editor) }
          onChange()
        })
      }
      const offs = events.map((ev) => editor.on(ev, update))
      return () => { for (const off of offs) off() }
    }, [editor])

    const getSnapshot = useCallback((): T => {
      // Rebuild the cache only when the editor identity itself changes (null → instance, swap),
      // OR (rare) the editor cleared its cache mid-flight. Identity-stable otherwise.
      if (cacheRef.current.editor !== editor) {
        cacheRef.current = { editor, value: editor ? compute(editor) : fallback }
      }
      return cacheRef.current.value
    }, [editor])

    return useSyncExternalStore(subscribe, getSnapshot, () => fallback)
  }
}

const NODE_EVENTS = ['node:added', 'node:removed', 'node:moved', 'graph:loaded', 'history:changed'] as const
const EDGE_EVENTS = ['edge:connected', 'edge:disconnected', 'node:removed', 'graph:loaded', 'history:changed'] as const
const GRAPH_EVENTS = [
  'node:added', 'node:removed', 'node:moved', 'edge:connected', 'edge:disconnected',
  'widget:changed', 'graph:loaded', 'history:changed',
] as const

const EMPTY_NODES: readonly Node[] = Object.freeze([])
const EMPTY_EDGES: readonly Edge[] = Object.freeze([])
const EMPTY_SELECTION: readonly NodeId[] = Object.freeze([])
const DEFAULT_VIEWPORT: ViewportState = Object.freeze({ x: 0, y: 0, zoom: 1 })

/** Live array of nodes; re-renders on add/remove/move, load and undo/redo. */
export const useNodes: () => readonly Node[] = makeEditorStoreHook(
  NODE_EVENTS,
  (e) => Object.freeze(Array.from(e.graph.nodes()) as Node[]) as readonly Node[],
  EMPTY_NODES,
)

/** Live array of edges; re-renders on connect/disconnect, node removal, load and undo/redo. */
export const useEdges: () => readonly Edge[] = makeEditorStoreHook(
  EDGE_EVENTS,
  (e) => Object.freeze(Array.from(e.graph.edges()) as Edge[]) as readonly Edge[],
  EMPTY_EDGES,
)

/** Live selection (node ids); re-renders on selection change. */
export const useSelection: () => readonly NodeId[] = makeEditorStoreHook(
  ['selection:changed'] as const,
  (e) => Object.freeze([...e.selection.ids()]) as readonly NodeId[],
  EMPTY_SELECTION,
)

/** Live viewport (`x`, `y`, `zoom`); re-renders on pan/zoom. */
export const useViewport: () => ViewportState = makeEditorStoreHook(
  ['viewport:changed'] as const,
  (e) => e.viewport,
  DEFAULT_VIEWPORT,
)

/** Live serialized graph (xenolith.v1); recomputes on any graph mutation, load and undo/redo. */
export const useGraphJSON: () => XenolithGraphV1 | null = makeEditorStoreHook(
  GRAPH_EVENTS,
  (e) => e.toJSON(),
  null as XenolithGraphV1 | null,
)
