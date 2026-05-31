import { MoveNode } from '@xenolith/core'
import type { NodeId, Node } from '@xenolith/core'
import type { PluginContext, XenolithPlugin } from '@xenolith/editor'
import type { LayoutEngine, LayoutOpts, LayoutResult } from './engine.js'
import { buildLayoutGraph } from './build-layout-graph.js'

export type {
  LayoutEngine, LayoutGraph, LayoutNode, LayoutEdge, LayoutOpts, LayoutResult,
} from './engine.js'

export interface AutoLayoutConfig {
  engine: LayoutEngine
  /** Override defaults applied when `arrange()` is called without explicit opts. */
  defaults?: LayoutOpts
}

/** The plugin object returned by `autoLayoutPlugin()`. Keep the reference handy — `arrange()` is
 *  the method you call to do the work. Multiple plugin instances can coexist on one editor under
 *  different `name`s (e.g. one configured for LR / DAG, another for TB / mind-map). */
export interface AutoLayoutPlugin extends XenolithPlugin {
  /** Run the configured engine against the current graph and apply the resulting positions in a
   *  single transaction (= one undo step). Throws if the plugin wasn't installed yet, or if the
   *  engine rejects (e.g. AbortSignal fired). Resolves with the raw `LayoutResult` so the caller
   *  can also inspect edge routes when the engine returns them. */
  arrange(opts?: LayoutOpts): Promise<LayoutResult>
}

const DEFAULT_NAME = 'autolayout'

export function autoLayoutPlugin(config: AutoLayoutConfig & { name?: string }): AutoLayoutPlugin {
  let ctx: PluginContext | null = null
  return {
    name: config.name ?? DEFAULT_NAME,
    install(c) {
      ctx = c
      return () => { ctx = null }
    },
    async arrange(opts) {
      if (!ctx) throw new Error('autolayout: arrange() called before editor.use(plugin)')
      const merged: LayoutOpts = { ...(config.defaults ?? {}), ...(opts ?? {}) }
      const layoutGraph = buildLayoutGraph(ctx.graph)
      if (layoutGraph.nodes.length === 0) return { positions: new Map() }
      const result = await config.engine.layout(layoutGraph, merged)
      if (result.positions.size === 0) return result

      // Capture START positions BEFORE we commit the final ones. Used by the animation path AND
      // by the no-animation path (latter needs them to skip identity moves).
      const starts = new Map<string, { x: number; y: number }>()
      for (const id of result.positions.keys()) {
        const live = ctx!.graph.getNode(id as NodeId) as Node | undefined
        if (live) starts.set(id, { x: live.position.x, y: live.position.y })
      }

      const animateMs = merged.animate?.durationMs ?? 0
      if (animateMs > 0) await tweenPositions(ctx!, starts, result.positions, animateMs, merged.animate?.easing ?? easeInOutCubic)

      ctx!.commandBus.transaction(() => {
        for (const [id, pos] of result.positions) {
          const live = ctx!.graph.getNode(id as NodeId) as Node | undefined
          if (!live) continue
          const s = starts.get(id)
          if (s && s.x === pos.x && s.y === pos.y) continue
          ctx!.commandBus.apply(new MoveNode(id as NodeId, { x: pos.x, y: pos.y }))
        }
      })
      return result
    },
  }
}

const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

/** Per-frame ephemeral position updates from `starts` → `targets`. Bypasses the command bus
 *  (`MoveNode` would push N×frames undo entries for nothing — see #propagateToDisplayConsumers
 *  pattern for ephemeral writes). The plugin commits the FINAL positions in one transaction once
 *  the tween settles. */
async function tweenPositions(
  ctx: PluginContext,
  starts: ReadonlyMap<string, { x: number; y: number }>,
  targets: ReadonlyMap<string, { x: number; y: number }>,
  durationMs: number,
  easing: (t: number) => number,
): Promise<void> {
  const start = performance.now()
  return new Promise((resolve) => {
    const step = (): void => {
      const elapsed = performance.now() - start
      const t = Math.min(1, elapsed / durationMs)
      const e = easing(t)
      for (const [id, end] of targets) {
        const s = starts.get(id)
        if (!s) continue
        const live = ctx.graph.getNode(id as NodeId)
        if (!live) continue
        // Ephemeral move — syncs node data + view container + incident edges + requests render.
        // setNodePositionEphemeral is the editor's contract for "I'll commit the final position
        // through MoveNode at the end; in the meantime, just paint here".
        ctx.setNodePositionEphemeral(id as NodeId, s.x + (end.x - s.x) * e, s.y + (end.y - s.y) * e)
      }
      if (t < 1) requestAnimationFrame(step)
      else resolve()
    }
    requestAnimationFrame(step)
  })
}
