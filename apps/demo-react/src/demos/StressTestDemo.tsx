import { useRef, useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton } from '@xenolith/react'
import type { XenolithEditor } from '@xenolith/editor'
import { buildStressTest, type StressHandle } from '@xenolith/demo/stress-test'
import { DemoStage } from '../Layout.js'

// Perf flex: hundreds–thousands of WebGL nodes, pan/zoom at 60fps. The node generation + reset live
// in the framework-agnostic core (@xenolith/demo/stress-test); this React file is just the +N / Reset
// panel and the live count.
export function StressTestDemo() {
  const handle = useRef<StressHandle | null>(null)
  const busy = useRef(false)
  const [count, setCount] = useState(0)

  const onReady = (editor: XenolithEditor): void => {
    handle.current = buildStressTest(editor, 500)
    setCount(handle.current.count())
  }
  const add = (n: number): void => {
    if (!handle.current || busy.current) return
    busy.current = true
    setCount(handle.current.add(n))
    busy.current = false
  }
  const reset = (): void => { if (handle.current) setCount(handle.current.reset()) }

  return (
    <DemoStage>
      <XenolithGraph className="xeno" resizeToWindow={false} onReady={onReady}>
        <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 6, width: 168 }}>
          <p style={{ margin: 0, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--xeno-muted)' }}>Stress test</p>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--xeno-accent)', fontVariantNumeric: 'tabular-nums' }}>{count}<span style={{ fontSize: 12, color: 'var(--xeno-muted)', fontWeight: 400 }}> nodes</span></div>
          <div style={{ display: 'flex', gap: 6 }}>
            <XenolithButton onClick={() => add(500)} style={{ flex: 1 }}>+500</XenolithButton>
            <XenolithButton onClick={() => add(1000)} style={{ flex: 1 }}>+1000</XenolithButton>
          </div>
          <XenolithButton onClick={reset} style={{ width: '100%' }}>Reset</XenolithButton>
          <span style={{ color: 'var(--xeno-muted)', fontSize: 11, lineHeight: 1.4 }}>
            Generate nodes, pan and zoom. Live stats top-right. WebGL, render-on-demand.
          </span>
        </XenolithPanel>
      </XenolithGraph>
    </DemoStage>
  )
}
