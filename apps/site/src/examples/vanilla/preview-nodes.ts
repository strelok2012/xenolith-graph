// Vanilla mount for the per-node canvas drawing showcase (G11).
import { XenolithEditor } from '@xenolith/editor'
import { buildPreviewNodes } from '@xenolith/demo/preview-nodes'

export async function mount(target: HTMLElement): Promise<() => void> {
  const editor = await XenolithEditor.init(target, { minimap: false })
  const scene = buildPreviewNodes(editor)
  return () => { scene.dispose(); editor.destroy() }
}
