import type { WidgetProps } from '@xenolith/react'

// An SVG sparkline that reads its series from the widget value and reshuffles it on click —
// strokes with var(--xeno-accent) so it tracks the active theme.
export function Sparkline({ value, setValue }: WidgetProps) {
  const data = Array.isArray(value) ? (value as number[]) : []
  const pts = data.map((v, i) => `${(i / Math.max(1, data.length - 1)) * 100},${100 - v * 100}`).join(' ')
  return (
    <div className="w-spark">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-spark-svg">
        <polyline points={pts} fill="none" stroke="var(--xeno-accent)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => setValue(Array.from({ length: 16 }, () => Math.random()))}>
        Shuffle
      </button>
    </div>
  )
}
