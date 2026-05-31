import { useEffect, useRef } from 'react'
import type { XenolithEditor } from '@xenolith/editor'
import { XenolithGraph } from '@xenolith/react'
import { buildPreviewNodes, type PreviewNodesScene } from '@xenolith/demo/preview-nodes'
import { DemoStage } from '../Layout.js'

/** Island: G11 — per-node canvas drawing. A Sparkline node paints a rolling line plot of the
 *  upstream slider's value; a ColorPreview node paints a swatch from `node.state.tint`. Both
 *  use the existing custom-canvas widget API (`CanvasWidgetController.draw`) — no new core
 *  surface needed. This demo is the proof. */
export function PreviewNodesDemo() {
  const sceneRef = useRef<PreviewNodesScene | null>(null)
  useEffect(() => () => { sceneRef.current?.dispose() }, [])
  const onReady = (editor: XenolithEditor): void => { sceneRef.current = buildPreviewNodes(editor) }
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={onReady} />
    </DemoStage>
  )
}
