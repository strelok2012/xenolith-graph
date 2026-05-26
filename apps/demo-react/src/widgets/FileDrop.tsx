import type { WidgetProps } from '@xenolith/react'

// Drag-and-drop (or browse) an image; reads it to a data URL and previews it inline.
export function FileDrop({ value, setValue }: WidgetProps) {
  const onFile = (file?: File): void => {
    if (!file) return
    const r = new FileReader()
    r.onload = () => setValue(r.result as string)
    r.readAsDataURL(file)
  }
  const hasImg = typeof value === 'string' && value.startsWith('data:')
  return (
    <div className="w-drop" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]) }}>
      {hasImg
        ? <img src={value as string} className="w-drop-img" alt="" />
        : <label className="w-drop-empty">Drop image or <span>browse</span>
            <input type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </label>}
    </div>
  )
}
