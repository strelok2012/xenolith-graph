import { XenolithGraph } from '@xenolith/react'
import { setupPreviewNodes } from '@xenolith/demo/preview-nodes'
import { DemoStage } from '../Layout.js'

// Canon: this demo has no React UI of its own — the panel is the canvas. Setup runs in `onReady`;
// the poller it installs is wrapped as a plugin, so the editor's destroy clears the interval. No
// ref, no useEffect cleanup, no scene handle.

/** Island: G11 — per-node canvas drawing. */
export function PreviewNodesDemo() {
  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={setupPreviewNodes} />
    </DemoStage>
  )
}
