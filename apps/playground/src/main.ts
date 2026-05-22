import { Application } from 'pixi.js'
import { createNodeId, createPinId, type Node, type Pin } from '@xenolith/core'
import { renderNode, renderEdge, computeNodeLayout } from '@xenolith/render-pixi'
import type { PinLayout } from '@xenolith/render-pixi'
import { xenTokens } from '@xenolith/theme-xen'

const root = document.getElementById('app')
if (!root) throw new Error('playground: missing #app root element')

const app = new Application()

function makePin(direction: 'in' | 'out', type: string, label: string): Pin {
  return { id: createPinId(), kind: 'data', direction, type, multiple: direction === 'out', label }
}

function findPinLayout(node: Node, pinIndex: number): PinLayout {
  const layout = computeNodeLayout(node, {
    node:   xenTokens.geometry.node,
    pin:    {
      diameter:   xenTokens.geometry.pin.diameter,
      rowSpacing: xenTokens.geometry.pin.rowSpacing,
      rowHeight:  xenTokens.geometry.pin.rowHeight,
    },
    header: { toPinsGap: xenTokens.geometry.header.toPinsGap },
  })
  const pin = node.pins[pinIndex]
  if (!pin) throw new Error(`no pin at index ${pinIndex}`)
  const layoutPin = layout.pins.find((p) => p.id === pin.id)
  if (!layoutPin) throw new Error(`pin not in layout`)
  return layoutPin
}

async function init(): Promise<void> {
  await app.init({
    background: xenTokens.color.surface.canvas,
    resizeTo: window,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    preference: 'webgl',
  })
  root!.appendChild(app.canvas)

  const logicNode: Node = {
    id: createNodeId(),
    type: 'Логика',
    position: { x: 60, y: 80 },
    size: { x: 150, y: 70 },
    state: {},
    pins: [
      makePin('in',  'float', 'Вход'),
      makePin('out', 'float', 'Выход'),
    ],
  }

  const dataNode: Node = {
    id: createNodeId(),
    type: 'Данные',
    position: { x: 60, y: 240 },
    size: { x: 150, y: 85 },
    state: {},
    pins: [
      makePin('in',  'object', 'Вход'),
      makePin('out', 'object', 'Выход'),
    ],
  }

  const macroNode: Node = {
    id: createNodeId(),
    type: 'Макро',
    position: { x: 320, y: 150 },
    size: { x: 150, y: 105 },
    state: {},
    pins: [
      makePin('in',  'float',    'Вход'),
      makePin('in',  'object',   'Вход'),
      makePin('in',  'wildcard', 'Вход'),
      makePin('out', 'string',   'Выход'),
    ],
  }

  const utilityNode: Node = {
    id: createNodeId(),
    type: 'Утилита',
    position: { x: 580, y: 180 },
    size: { x: 150, y: 70 },
    state: {},
    pins: [
      makePin('in',  'string', 'Вход'),
      makePin('out', 'any',    'Выход'),
    ],
  }

  // Edges go on the stage UNDER nodes so they render below the bodies.
  app.stage.addChild(
    renderEdge(findPinLayout(logicNode, 1),  findPinLayout(macroNode, 0), xenTokens, { sourceType: 'float'  }),
    renderEdge(findPinLayout(dataNode, 1),   findPinLayout(macroNode, 1), xenTokens, { sourceType: 'object' }),
    renderEdge(findPinLayout(macroNode, 3),  findPinLayout(utilityNode, 0), xenTokens, { sourceType: 'string' }),
  )

  app.stage.addChild(
    renderNode(logicNode,   xenTokens, { category: 'logic',   title: 'Логика'  }),
    renderNode(dataNode,    xenTokens, { category: 'data',    title: 'Данные'  }),
    renderNode(macroNode,   xenTokens, { category: 'macro',   title: 'Макро'   }),
    renderNode(utilityNode, xenTokens, { category: 'utility', title: 'Утилита' }),
  )
}

void init()
