import { useEffect, useState, type ComponentType } from 'react'
// Demo components + their global styles live in apps/demo-react (the shared React demo source the
// gallery imports as islands). One import of the stylesheet covers all of them.
import '../../../demo-react/src/styles.css'
import { MountDemo } from '../../../demo-react/src/demos/MountDemo'
import { LoadDemo } from '../../../demo-react/src/demos/LoadDemo'
import { EventsDemo } from '../../../demo-react/src/demos/EventsDemo'
import { ThemingDemo } from '../../../demo-react/src/demos/ThemingDemo'
import { ViewportDemo } from '../../../demo-react/src/demos/ViewportDemo'
import { CanvasWidgetDemo } from '../../../demo-react/src/demos/CanvasWidgetDemo'
import { CustomWidgetsDemo } from '../../../demo-react/src/demos/CustomWidgetsDemo'
import { OverviewDemo } from '../../../demo-react/src/demos/OverviewDemo'
import { BuiltinWidgetsDemo } from '../../../demo-react/src/demos/BuiltinWidgetsDemo'
import { TwoWayBindingDemo } from '../../../demo-react/src/demos/TwoWayBindingDemo'
import { AudioSynthDemo } from '../../../demo-react/src/demos/AudioSynthDemo'
import { LLMBuilderDemo } from '../../../demo-react/src/demos/LLMBuilderDemo'
import { SaveRestoreDemo } from '../../../demo-react/src/demos/SaveRestoreDemo'
import { ImagePipelineDemo } from '../../../demo-react/src/demos/ImagePipelineDemo'
import { ConnectionValidationDemo } from '../../../demo-react/src/demos/ConnectionValidationDemo'
import { ExportImageDemo } from '../../../demo-react/src/demos/ExportImageDemo'
import { DiagramDemo } from '../../../demo-react/src/demos/DiagramDemo'
// StressTestDemo hidden from the gallery for now (perf trap with mass-clear); file kept for later.

const MAP: Record<string, ComponentType> = {
  'llm-builder': LLMBuilderDemo,
  'audio-synth': AudioSynthDemo,
  'save-restore': SaveRestoreDemo,
  'image-pipeline': ImagePipelineDemo,
  overview: OverviewDemo,
  mount: MountDemo, load: LoadDemo, events: EventsDemo,
  'two-way': TwoWayBindingDemo, theming: ThemingDemo, viewport: ViewportDemo,
  'connection-validation': ConnectionValidationDemo, 'export-image': ExportImageDemo,
  diagram: DiagramDemo,
  'builtin-widgets': BuiltinWidgetsDemo, 'canvas-widget': CanvasWidgetDemo, 'custom-widgets': CustomWidgetsDemo,
}

/** Renders one demo by id, fills its host, and remounts (fresh editor) when a matching `xeno:reset`
 *  event fires — that's the gallery's "Reset preview" button. */
export default function ReactExample({ id }: { id: string }): React.ReactElement | null {
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    const onReset = (e: Event): void => {
      const detail = (e as CustomEvent<{ id?: string }>).detail
      if (!detail?.id || detail.id === id) setNonce((n) => n + 1)
    }
    document.addEventListener('xeno:reset', onReset)
    return () => document.removeEventListener('xeno:reset', onReset)
  }, [id])
  const Cmp = MAP[id]
  if (!Cmp) return null
  return (
    <div key={nonce} style={{ position: 'absolute', inset: 0, display: 'flex' }}>
      <Cmp />
    </div>
  )
}
