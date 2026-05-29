import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { MergedApp } from './MergedApp.js'
import './styles.css'

// Two views: the domain demo (App — has its own JS/Plugin engine switch inside) and the merged
// "agents are real nodes in the algorithm graph" view. ?engine=merged picks the latter.
const engine = new URLSearchParams(globalThis.location?.search ?? '').get('engine')

createRoot(document.getElementById('root')!).render(
  <StrictMode>{engine === 'merged' ? <MergedApp /> : <App />}</StrictMode>,
)
