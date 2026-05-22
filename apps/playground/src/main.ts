import { Application } from 'pixi.js'
import { xenTokens } from '@xenolith/theme-xen'

const root = document.getElementById('app')
if (!root) throw new Error('playground: missing #app root element')

const app = new Application()

async function init(): Promise<void> {
  await app.init({
    background: xenTokens.color.surface.canvas,
    resizeTo: window,
    antialias: true,
    preference: 'webgl',
  })
  root!.appendChild(app.canvas)
}

void init()
