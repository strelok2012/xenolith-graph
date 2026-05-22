import { Application } from 'pixi.js'
import { createNodeId, createPinId, type Node } from '@xenolith/core'
import { renderNode } from '@xenolith/render-pixi'
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

  const demoNode: Node = {
    id: createNodeId(),
    type: 'Текст',
    position: { x: 200, y: 200 },
    size: { x: 150, y: 70 },
    state: {},
    pins: [
      { id: createPinId(), kind: 'data', direction: 'in',  type: 'float', multiple: false, label: 'Вход' },
      { id: createPinId(), kind: 'data', direction: 'out', type: 'float', multiple: true,  label: 'Выход' },
    ],
  }

  const sprite = renderNode(demoNode, xenTokens, { category: 'logic', title: 'Текст' })
  app.stage.addChild(sprite)
}

void init()
