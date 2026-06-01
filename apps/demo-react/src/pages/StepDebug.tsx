import { useRef } from 'react'
import { StepDebuggerDemo } from '../demos/StepDebuggerDemo.js'

// SPA wrapper around the gallery showcase so Playwright can drive it. The StepDebuggerDemo
// itself owns no external hook — to keep test surface small, we re-expose the live debugger
// + editor on `window.__xenoDebug` from inside DebuggerHandshake (see below).

export function StepDebug() {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  return (
    <div ref={wrapRef} className="editor-wrap" style={{ flex: 1, minHeight: 0 }}>
      <StepDebuggerDemo />
    </div>
  )
}
