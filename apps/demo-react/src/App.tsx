import { useState, type ReactNode } from 'react'
import { Mount } from './pages/Mount.js'
import { Load } from './pages/Load.js'
import { Events } from './pages/Events.js'
import { Binding } from './pages/Binding.js'
import { GraphJson } from './pages/GraphJson.js'
import { Theming } from './pages/Theming.js'
import { Viewport } from './pages/Viewport.js'
import { CanvasWidget } from './pages/CanvasWidget.js'
import { Hero } from './pages/Hero.js'
import { Stress } from './pages/Stress.js'
import { StepDebug } from './pages/StepDebug.js'
import { TimeTravel } from './pages/TimeTravel.js'
import { GraphDiff } from './pages/GraphDiff.js'
import { Heatmap } from './pages/Heatmap.js'

interface PageDef { id: string; label: string; el: ReactNode }

const PAGES: PageDef[] = [
  { id: 'mount', label: '0 · Mount', el: <Mount /> },
  { id: 'load', label: '1 · Load a graph', el: <Load /> },
  { id: 'events', label: '2 · Events → state', el: <Events /> },
  { id: 'binding', label: '3 · Two-way binding (widgets)', el: <Binding /> },
  { id: 'graph-json', label: '3 · Graph ⇄ JSON', el: <GraphJson /> },
  { id: 'theming', label: '4 · Theming', el: <Theming /> },
  { id: 'viewport', label: '5 · Viewport & minimap', el: <Viewport /> },
  { id: 'canvas-widget', label: '6 · Custom widget (canvas)', el: <CanvasWidget /> },
  { id: 'hero', label: '7 · Bring your own UI', el: <Hero /> },
  { id: 'stress', label: '8 · Stress (virtualize)', el: <Stress /> },
  { id: 'step-debug', label: '9 · Step debugger', el: <StepDebug /> },
  { id: 'time-travel', label: '10 · Time-travel', el: <TimeTravel /> },
  { id: 'graph-diff', label: '11 · Graph diff', el: <GraphDiff /> },
  { id: 'heatmap', label: '12 · Heatmap', el: <Heatmap /> },
]

export function App() {
  const [active, setActive] = useState(PAGES[0]!.id)
  const page = PAGES.find((p) => p.id === active)!

  return (
    <div className="app">
      <nav className="sidebar">
        <h2>XenolithGraph · React</h2>
        {PAGES.map((p) => (
          <button key={p.id} className={p.id === active ? 'active' : ''} onClick={() => setActive(p.id)}>
            {p.label}
          </button>
        ))}
      </nav>
      {/* key remounts the page on switch → the previous editor is destroyed (frees its WebGL context). */}
      <div key={active} style={{ flex: 1, display: 'flex', minWidth: 0 }}>
        {page.el}
      </div>
    </div>
  )
}
