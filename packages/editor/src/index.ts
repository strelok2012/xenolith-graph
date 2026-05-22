import { Application, Container, type ContainerChild } from 'pixi.js'
import { Graph, type Node } from '@xenolith/core'
import {
  renderNode,
  renderEdge,
  computeNodeLayout,
  type PinLayout,
  type RenderNodeOptions,
  type RenderEdgeOptions,
} from '@xenolith/render-pixi'
import { xenTokens, loadXenFonts, type XenTokens } from '@xenolith/theme-xen'

export const VERSION = '0.0.0'

export interface XenolithEditorOptions {
  /** Override theme tokens. Defaults to the bundled Xen system. */
  theme?: XenTokens
  /** Override PIXI background. Defaults to the theme canvas colour. */
  background?: string
  /** Whether to listen for window resize and rescale the canvas. Defaults to true. */
  resizeToWindow?: boolean
  /** WebGL preference. Defaults to 'webgl'. */
  renderer?: 'webgl' | 'webgpu'
}

/**
 * The public, drop-in editor. Consumers only ever call:
 *
 * ```ts
 * const editor = await XenolithEditor.init('#app')
 * editor.addNode({ ... })
 * editor.connect(nodeA, 'out0', nodeB, 'in0', { sourceType: 'float' })
 * ```
 *
 * Font loading, PIXI bootstrap, canvas mount, and scene wiring are handled inside `init()`.
 */
export class XenolithEditor {
  readonly graph: Graph
  readonly #app: Application
  readonly #theme: XenTokens
  readonly #edgesLayer: Container<ContainerChild>
  readonly #nodesLayer: Container<ContainerChild>

  private constructor(app: Application, theme: XenTokens) {
    this.#app = app
    this.#theme = theme
    this.graph = new Graph()
    this.#edgesLayer = new Container({ label: 'edges' })
    this.#nodesLayer = new Container({ label: 'nodes' })
    app.stage.addChild(this.#edgesLayer, this.#nodesLayer)
  }

  /**
   * Bootstrap the editor: load bundled fonts, create the PIXI Application, attach the canvas to
   * the given target element, and return a ready-to-use editor instance.
   */
  static async init(
    target: string | HTMLElement,
    opts: XenolithEditorOptions = {},
  ): Promise<XenolithEditor> {
    const el = typeof target === 'string' ? document.querySelector(target) : target
    if (!(el instanceof HTMLElement)) {
      throw new Error(
        `XenolithEditor.init: target ${JSON.stringify(target)} did not resolve to an HTMLElement`,
      )
    }

    await loadXenFonts()

    const theme = opts.theme ?? xenTokens
    const app = new Application()
    const initOpts: Parameters<Application['init']>[0] = {
      background: opts.background ?? theme.color.surface.canvas,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      preference: opts.renderer ?? 'webgl',
    }
    if (opts.resizeToWindow !== false) initOpts.resizeTo = window
    await app.init(initOpts)
    el.appendChild(app.canvas)

    return new XenolithEditor(app, theme)
  }

  /** Add a node to the graph and the scene. Returns the inserted node. */
  addNode(node: Node, render: RenderNodeOptions = {}): Node {
    this.graph._addNode(node)
    const sprite = renderNode(node, this.#theme, render)
    this.#nodesLayer.addChild(sprite)
    return node
  }

  /**
   * Connect two pins by their indices in the respective `node.pins` arrays.
   * Convenience wrapper that resolves world-space pin positions, draws the edge below the nodes,
   * and stores a structural Edge in the graph.
   */
  connect(
    fromNode: Node,
    fromPinIndex: number,
    toNode: Node,
    toPinIndex: number,
    opts: RenderEdgeOptions = {},
  ): void {
    const fromPin = this.#pinLayout(fromNode, fromPinIndex)
    const toPin = this.#pinLayout(toNode, toPinIndex)
    const edge = renderEdge(fromPin, toPin, this.#theme, opts)
    this.#edgesLayer.addChild(edge)
  }

  /** Direct access to the underlying PIXI Application — escape hatch for advanced consumers. */
  get app(): Application {
    return this.#app
  }

  /** Direct access to the resolved theme tokens (defaults or overridden). */
  get theme(): XenTokens {
    return this.#theme
  }

  /** Tear down the PIXI application and remove the canvas from the DOM. */
  destroy(): void {
    this.#app.destroy(true, { children: true })
  }

  #pinLayout(node: Node, pinIndex: number): PinLayout {
    const layout = computeNodeLayout(node, {
      node: this.#theme.geometry.node,
      pin: {
        diameter: this.#theme.geometry.pin.diameter,
        rowSpacing: this.#theme.geometry.pin.rowSpacing,
        rowHeight: this.#theme.geometry.pin.rowHeight,
      },
      header: { toPinsGap: this.#theme.geometry.header.toPinsGap },
    })
    const pin = node.pins[pinIndex]
    if (!pin) throw new Error(`XenolithEditor.connect: node has no pin at index ${pinIndex}`)
    const layoutPin = layout.pins.find((p) => p.id === pin.id)
    if (!layoutPin) throw new Error(`XenolithEditor.connect: pin ${pin.id} not in layout`)
    return layoutPin
  }
}
