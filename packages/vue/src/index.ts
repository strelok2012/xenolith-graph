import { defineComponent, h, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  createEditorBinding,
  EDITOR_EVENT_NAMES,
  type EditorBinding,
  type XenolithProps,
} from '@xenolith/adapter-core'

/** `node:click` → `nodeClick` (emit name); bind in templates as `@node-click`. */
export function emitName(event: string): string {
  const [head, tail] = event.split(':')
  return tail ? head! + tail[0]!.toUpperCase() + tail.slice(1) : head!
}

/**
 * `<XenolithGraph>` — Vue 3 component. Props: `theme`, `graph`, `zoomBounds`, `minimap`,
 * `disable-grid`, `snap`, `fit-on-load`. Editor events are emitted as `@node-click`,
 * `@selection-changed`, `@edge-connected`, … Editor is WebGL/client-only.
 */
export const XenolithGraph = defineComponent({
  name: 'XenolithGraph',
  props: {
    theme: { type: null, default: undefined },
    graph: { type: null, default: undefined },
    zoomBounds: { type: null, default: undefined },
    minimap: { type: null, default: undefined },
    disableGrid: { type: Boolean, default: undefined },
    snap: { type: Number, default: undefined },
    resizeToWindow: { type: Boolean, default: undefined },
    fitOnLoad: { type: Boolean, default: undefined },
  },
  emits: EDITOR_EVENT_NAMES.map(emitName),
  setup(props, { emit, expose }) {
    const host = ref<HTMLDivElement | null>(null)
    let binding: EditorBinding | null = null
    const offs: Array<() => void> = []

    const pick = (): XenolithProps => {
      const p: XenolithProps = {}
      if (props.theme !== undefined) p.theme = props.theme as XenolithProps['theme']
      if (props.graph !== undefined) p.graph = props.graph
      if (props.zoomBounds !== undefined) p.zoomBounds = props.zoomBounds as XenolithProps['zoomBounds']
      if (props.minimap !== undefined) p.minimap = props.minimap as XenolithProps['minimap']
      if (props.disableGrid !== undefined) p.disableGrid = props.disableGrid
      if (props.snap !== undefined) p.snap = props.snap
      if (props.resizeToWindow !== undefined) p.resizeToWindow = props.resizeToWindow
      if (props.fitOnLoad !== undefined) p.fitOnLoad = props.fitOnLoad
      return p
    }

    onMounted(async () => {
      if (!host.value) return
      const b = await createEditorBinding(host.value, pick())
      binding = b
      for (const ev of EDITOR_EVENT_NAMES) {
        offs.push(b.on(ev, (payload) => emit(emitName(ev) as never, payload as never)))
      }
    })

    watch(
      [() => props.theme, () => props.graph, () => props.zoomBounds, () => props.minimap, () => props.disableGrid, () => props.snap, () => props.fitOnLoad],
      () => binding?.setProps(pick()),
    )

    onUnmounted(() => { for (const off of offs) off(); binding?.destroy(); binding = null })

    expose({ get editor() { return binding?.editor ?? null } })

    return () => h('div', { ref: host, class: 'xenolith-graph' })
  },
})
