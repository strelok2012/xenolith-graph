import { createEditorBinding, type EditorBinding, type XenolithProps } from '@xenolith/adapter-core'
import type { XenolithEditor } from '@xenolith/editor'
import { readAttributes, FORWARDED_EVENTS } from './attrs.js'

/** `<xenolith-graph>` — the universal adapter. Declarative attributes (`minimap`, `fit-on-load`,
 *  `disable-grid`) and JS properties (`theme`, `graph`) feed the editor; every public editor event
 *  is re-emitted off the element as a same-named CustomEvent. Works in any framework that speaks
 *  DOM (Angular, Vue, Svelte, Solid, Lit, Astro, vanilla). */
export class XenolithGraphElement extends HTMLElement {
  static get observedAttributes(): string[] { return ['minimap', 'fit-on-load', 'disable-grid'] }

  #binding: EditorBinding | null = null
  #props: XenolithProps = {}
  #offs: Array<() => void> = []
  #mounting = false

  set theme(v: XenolithProps['theme']) { this.#patch({ theme: v }) }
  get theme(): XenolithProps['theme'] { return this.#props.theme }
  set graph(v: unknown) { this.#patch({ graph: v }) }
  get graph(): unknown { return this.#props.graph }
  set zoomBounds(v: XenolithProps['zoomBounds']) { this.#patch({ zoomBounds: v }) }

  /** The live editor instance, or null before mount / after teardown. */
  get editor(): XenolithEditor | null { return this.#binding?.editor ?? null }

  connectedCallback(): void {
    this.#props = { ...readAttributes(this), ...this.#props }
    void this.#mount()
  }

  disconnectedCallback(): void {
    for (const off of this.#offs) off()
    this.#offs = []
    this.#binding?.destroy()
    this.#binding = null
  }

  attributeChangedCallback(): void {
    this.#patch(readAttributes(this))
  }

  async #mount(): Promise<void> {
    if (this.#mounting || this.#binding) return
    this.#mounting = true
    let binding: EditorBinding
    try {
      binding = await createEditorBinding(this, this.#props)
    } finally {
      this.#mounting = false
    }
    if (!this.isConnected) { binding.destroy(); return } // detached while awaiting init
    this.#binding = binding
    for (const name of FORWARDED_EVENTS) {
      this.#offs.push(
        binding.on(name, (detail) =>
          this.dispatchEvent(new CustomEvent(name, { detail, bubbles: false })),
        ),
      )
    }
  }

  #patch(partial: Partial<XenolithProps>): void {
    this.#props = { ...this.#props, ...partial }
    this.#binding?.setProps(this.#props)
  }
}
