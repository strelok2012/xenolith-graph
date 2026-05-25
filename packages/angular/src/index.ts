import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core'
import type { AfterViewInit, OnChanges, OnDestroy } from '@angular/core'
import {
  createEditorBinding, EDITOR_EVENT_NAMES, type EditorBinding, type XenolithProps,
} from '@xenolith/adapter-core'
import type { EditorEvents, XenolithEditor } from '@xenolith/editor'

/** `node:click` → `nodeClick` (the `@Output()` name; bound as `(nodeClick)`). */
export function angularOutputName(event: string): string {
  const [head, tail] = event.split(':')
  return tail ? head! + tail[0]!.toUpperCase() + tail.slice(1) : head!
}

/**
 * `<xenolith-graph>` — Angular standalone component. Inputs: `theme`, `graph`, `zoomBounds`,
 * `minimap`, `disableGrid`, `snap`, `fitOnLoad`. Outputs map editor events to camelCase emitters
 * (`(nodeClick)`, `(selectionChanged)`, `(edgeConnected)`, …). Editor is WebGL/client-only.
 */
@Component({
  selector: 'xenolith-graph',
  standalone: true,
  template: '<div #host style="width:100%;height:100%"></div>',
})
export class XenolithGraphComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('host', { static: true }) host!: ElementRef<HTMLDivElement>

  @Input() theme?: XenolithProps['theme']
  @Input() graph?: unknown
  @Input() zoomBounds?: XenolithProps['zoomBounds']
  @Input() minimap?: XenolithProps['minimap']
  @Input() disableGrid?: boolean
  @Input() snap?: number
  @Input() resizeToWindow?: boolean
  @Input() fitOnLoad?: boolean

  @Output() ready = new EventEmitter<XenolithEditor>()
  @Output() nodeAdded = new EventEmitter<EditorEvents['node:added']>()
  @Output() nodeRemoved = new EventEmitter<EditorEvents['node:removed']>()
  @Output() nodeMoved = new EventEmitter<EditorEvents['node:moved']>()
  @Output() nodeClick = new EventEmitter<EditorEvents['node:click']>()
  @Output() edgeConnected = new EventEmitter<EditorEvents['edge:connected']>()
  @Output() edgeDisconnected = new EventEmitter<EditorEvents['edge:disconnected']>()
  @Output() selectionChanged = new EventEmitter<EditorEvents['selection:changed']>()
  @Output() viewportChanged = new EventEmitter<EditorEvents['viewport:changed']>()
  @Output() widgetChanged = new EventEmitter<EditorEvents['widget:changed']>()
  @Output() widgetAction = new EventEmitter<EditorEvents['widget:action']>()
  @Output() graphLoaded = new EventEmitter<EditorEvents['graph:loaded']>()
  @Output() historyChanged = new EventEmitter<EditorEvents['history:changed']>()

  #binding: EditorBinding | null = null
  #offs: Array<() => void> = []

  /** The live editor instance, or null before mount. */
  get editor(): XenolithEditor | null { return this.#binding?.editor ?? null }

  #props(): XenolithProps {
    const p: XenolithProps = {}
    if (this.theme !== undefined) p.theme = this.theme
    if (this.graph !== undefined) p.graph = this.graph
    if (this.zoomBounds !== undefined) p.zoomBounds = this.zoomBounds
    if (this.minimap !== undefined) p.minimap = this.minimap
    if (this.disableGrid !== undefined) p.disableGrid = this.disableGrid
    if (this.snap !== undefined) p.snap = this.snap
    if (this.resizeToWindow !== undefined) p.resizeToWindow = this.resizeToWindow
    if (this.fitOnLoad !== undefined) p.fitOnLoad = this.fitOnLoad
    return p
  }

  async ngAfterViewInit(): Promise<void> {
    const binding = await createEditorBinding(this.host.nativeElement, this.#props())
    this.#binding = binding
    this.ready.emit(binding.editor)
    for (const ev of EDITOR_EVENT_NAMES) {
      const emitter = (this as unknown as Record<string, EventEmitter<unknown>>)[angularOutputName(ev)]
      this.#offs.push(binding.on(ev, (payload) => emitter?.emit(payload)))
    }
  }

  ngOnChanges(): void { this.#binding?.setProps(this.#props()) }

  ngOnDestroy(): void {
    for (const off of this.#offs) off()
    this.#binding?.destroy()
    this.#binding = null
  }
}
