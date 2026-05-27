import type { Graphics, Container, TextureSource } from 'pixi.js'
import type { Node } from '@xenolith/core'
import type { XenTokens } from '@xenolith/theme-xen'
import type { NodeView, RenderNodeOptions } from './node-renderer.js'
import type { PinLayout } from './layout.js'
import type { RenderEdgeOptions } from './edge-renderer.js'

/**
 * A swappable theme. Bundles design tokens with optional per-element rendering hooks; if a hook
 * is omitted the editor falls back to the default Xen renderer for that element.
 *
 * Themes are values, not subclasses — registries can carry many side-by-side, and
 * `editor.setTheme(...)` swaps them at runtime by re-rendering every node, edge, and the grid.
 */
/** Shared editor state surfaced to theme render hooks. Themes that opt into backdrop sampling
 *  (Liquid Glass, Pixel Art) bind the live backdrop texture from this context to their shader.
 *  The texture instance is stable across resizes; PIXI updates the underlying GPU resource. */
export interface ThemeRenderContext {
  backdropTexture: TextureSource | null
}

/** CSS-level styling for DOM chrome (the insert palette, future panels). Themes provide this so
 *  the HTML overlays restyle alongside the PIXI canvas. Liquid Glass uses a frosted-glass
 *  approximation here (backdrop-filter blur) rather than the real backdrop-sampling shader —
 *  CSS is enough for chrome. Any omitted field falls back to a Xen-derived default. */
export interface PaletteStyle {
  /** CSS backdrop-filter value, e.g. 'blur(14px) saturate(140%)'. Omit / 'none' for flat themes. */
  backdropFilter?: string
  panelBackground: string
  panelBorder: string
  panelShadow?: string
  panelRadius?: string
  textColor: string
  mutedColor: string
  /** Highlight colour for matched query characters and the active row accent. */
  accent: string
  rowSelectedBackground: string
  inputBackground: string
  inputBorder?: string
}

export interface XenolithTheme {
  /** Stable identifier used for diffing in setTheme and for telemetry. */
  id: string
  tokens: XenTokens
  /** CSS styling for DOM chrome (insert palette). Falls back to a Xen-derived default. */
  paletteStyle?: PaletteStyle
  /** Opt-in flag — when true, the editor maintains a per-frame backdrop RenderTexture and
   *  surfaces it via `ThemeRenderContext.backdropTexture`. Themes that don't sample the
   *  backdrop (Xen, vanilla flat themes) leave this false so the editor skips the extra render
   *  pass entirely. */
  needsBackdrop?: boolean
  /** Opt-in flag — when true, the editor bakes each node into a sprite during a zoom/pan gesture
   *  and restores the live nodes on settle. Hides the per-frame cost of expensive materials (the
   *  Liquid Glass shader) during navigation. Cheap/flat themes (Xen) leave it false. */
  freezeOnNavigate?: boolean
  /** How a comment/group header is painted so it matches the theme's node header. `'gradient'`
   *  (default, Xen): horizontal accent fade + white highlight + rim. `'tint'` (Liquid Glass): flat
   *  accent tint, mirroring the LG node header tint. */
  commentHeaderStyle?: 'gradient' | 'tint'
  /** Viewport-virtualization threshold: once a graph exceeds this many nodes, the editor keeps a
   *  live PIXI view only for nodes near the viewport (off-screen nodes are data only). Defaults to
   *  300. Heavier themes (Liquid Glass — per-node backdrop RTs + shader) set a LOWER value so the
   *  GPU ceiling is reached at fewer nodes. At or below the threshold the graph renders 1:1. */
  virtualizeThreshold?: number
  /** Custom node rendering pipeline. Themes that need backdrop sampling read ctx.backdropTexture. */
  renderNode?: (node: Node, opts: RenderNodeOptions, ctx: ThemeRenderContext) => NodeView
  /** Custom reroute-knot rendering. Falls back to the Xen disc (`renderRerouteNode`) when omitted.
   *  Liquid Glass draws a glass disc here. */
  renderReroute?: (node: Node, opts: RenderNodeOptions, ctx: ThemeRenderContext) => NodeView
  /** Custom palette Reroute-node rendering (the compact headerless box). Falls back to the Xen box
   *  (`renderRerouteNodeBox`) when omitted. */
  renderRerouteNode?: (node: Node, opts: RenderNodeOptions, ctx: ThemeRenderContext) => NodeView
  /** Custom wire rendering. Returns the same `Graphics` so the editor can reuse the instance. */
  drawEdge?: (g: Graphics, from: PinLayout, to: PinLayout, opts: RenderEdgeOptions) => Graphics
  /** Custom canvas background / grid. Return an empty Container to mean "no grid at all". */
  createGrid?: () => Container
  /** Per-frame hook fired after the editor updates its backdrop RT. Themes use this to refresh
   *  per-frame uniforms across every mesh they created — e.g. uBackdropSize for Liquid Glass
   *  so its shader sampling stays correct when the canvas resizes. */
  onFrame?: (ctx: ThemeRenderContext) => void
  /** Hook fired per-node when the editor renders a personal backdrop RT for that node — painter's-
   *  order compositing for AABB-overlapping nodes (Liquid Glass refracts what's underneath). Themes
   *  swap the per-node mesh's uBackdropTex resource to this texture so the shader samples the
   *  node-specific composition rather than the shared empty backdrop. Called with `null` to revert
   *  a node back to the shared backdrop when it stops overlapping. */
  onNodeBackdrop?: (nodeId: string, texture: TextureSource | null) => void
}
