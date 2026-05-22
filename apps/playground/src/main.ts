import { createNodeId, createPinId, type Node, type Pin } from '@xenolith/core'
import { XenolithEditor } from '@xenolith/editor'

function pin(direction: 'in' | 'out', type: string, label: string): Pin {
  return { id: createPinId(), kind: 'data', direction, type, multiple: direction === 'out', label }
}

function makeNode(opts: { type: string; position: { x: number; y: number }; size: { x: number; y: number }; pins: Pin[] }): Node {
  return {
    id: createNodeId(),
    type: opts.type,
    position: opts.position,
    size: opts.size,
    state: {},
    pins: opts.pins,
  }
}

const editor = await XenolithEditor.init('#app')

const logicNode = makeNode({
  type: 'Логика',
  position: { x: 60, y: 80 },
  size: { x: 150, y: 70 },
  pins: [pin('in', 'float', 'Вход'), pin('out', 'float', 'Выход')],
})

const dataNode = makeNode({
  type: 'Данные',
  position: { x: 60, y: 240 },
  size: { x: 150, y: 85 },
  pins: [pin('in', 'object', 'Вход'), pin('out', 'object', 'Выход')],
})

const macroNode = makeNode({
  type: 'Макро',
  position: { x: 320, y: 150 },
  size: { x: 150, y: 105 },
  pins: [
    pin('in', 'float', 'Вход'),
    pin('in', 'object', 'Вход'),
    pin('in', 'wildcard', 'Вход'),
    pin('out', 'string', 'Выход'),
  ],
})

const utilityNode = makeNode({
  type: 'Утилита',
  position: { x: 580, y: 180 },
  size: { x: 150, y: 70 },
  pins: [pin('in', 'string', 'Вход'), pin('out', 'any', 'Выход')],
})

editor.addNode(logicNode,   { category: 'logic',   title: 'Логика'  })
editor.addNode(dataNode,    { category: 'data',    title: 'Данные'  })
editor.addNode(macroNode,   { category: 'macro',   title: 'Макро'   })
editor.addNode(utilityNode, { category: 'utility', title: 'Утилита' })

editor.connect(logicNode, 1, macroNode, 0,  { sourceType: 'float'  })
editor.connect(dataNode,  1, macroNode, 1,  { sourceType: 'object' })
editor.connect(macroNode, 3, utilityNode, 0, { sourceType: 'string' })
