// Render the whole graph to an image. editor.exportImage() draws every node (not just the visible
// viewport) into an offscreen canvas at any scale and returns a Blob — PNG for crisp UI, JPG for
// smaller files, 2× for retina. Framework-agnostic; the host just calls exportGraphImage from a button.

import type { XenolithEditor } from '@xenolith/editor'

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Export the entire graph and trigger a download. */
export async function exportGraphImage(editor: XenolithEditor, format: 'png' | 'jpeg', scale: number): Promise<void> {
  const blob = await editor.exportImage({ format, scale, padding: 48 })
  download(blob, `graph@${scale}x.${format === 'jpeg' ? 'jpg' : 'png'}`)
}
