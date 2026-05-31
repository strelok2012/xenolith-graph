// Spawn as a TemplateDefinition + per-instance `$templateInstance` node — same pattern as
// `allocate-template-v1.ts`. The dived view shows the primitive sub-graph from
// `buildSpawnSubgraphV1`; the outer-graph view sees ONE "Spawn" node.

import type { XenolithNodeV1, XenolithPinV1, XenolithEdgeV1 } from '@xenolith/editor'
import type { TemplateDefinition } from '@xenolith/core'
import { buildSpawnSubgraphV1 } from './spawn-graph-v1.js'

const TPL_INPUT    = '$templateInput'    as const
const TPL_OUTPUT   = '$templateOutput'   as const
const TPL_INSTANCE = '$templateInstance' as const

const di   = (id: string, label: string, type: string): XenolithPinV1 => ({ id, kind: 'data', direction: 'in',  type, multiple: false, label })
const dout = (id: string, label: string, type: string): XenolithPinV1 => ({ id, kind: 'data', direction: 'out', type, multiple: true,  label })

export function buildSpawnTemplateDefinition(): TemplateDefinition {
  const defId = 'tpl:spawn'

  const inExec  = boundaryIn('tplIn:exec',  'exec')
  const inSpecs = boundaryIn('tplIn:specs', 'array', 'specs')

  const outExec  = boundaryOut('tplOut:exec',  'exec')
  const outUnits = boundaryOut('tplOut:units', 'array', 'units')

  const sub = buildSpawnSubgraphV1('spawn', 200, 0, {
    specs: { node: inSpecs.id, pin: inSpecs.pins[0]!.id },
    exec:  { node: inExec.id,  pin: inExec.pins[0]!.id },
  })

  const drainEdges: XenolithEdgeV1[] = [
    { id: 'tplE:exec',  from: { node: sub.out.exec.node,  pin: sub.out.exec.pin },  to: { node: outExec.id,  pin: outExec.pins[0]!.id } },
    { id: 'tplE:units', from: { node: sub.out.units.node, pin: sub.out.units.pin }, to: { node: outUnits.id, pin: outUnits.pins[0]!.id } },
  ]

  return {
    id: defId as TemplateDefinition['id'],
    title: 'Spawn',
    nodes: [
      inExec, inSpecs,
      ...(sub.nodes as unknown as TemplateDefinition['nodes']),
      outExec, outUnits,
    ] as TemplateDefinition['nodes'],
    edges: [
      ...(sub.edges as unknown as TemplateDefinition['edges']),
      ...(drainEdges as unknown as TemplateDefinition['edges']),
    ] as TemplateDefinition['edges'],
  }
}

export function buildSpawnInstance(instanceId: string, x: number, y: number): XenolithNodeV1 {
  const def = buildSpawnTemplateDefinition()
  const pinBoundary: Record<string, string> = {
    [`${instanceId}:exec`]:    'tplIn:exec',
    [`${instanceId}:specs`]:   'tplIn:specs',
    [`${instanceId}:execOut`]: 'tplOut:exec',
    [`${instanceId}:units`]:   'tplOut:units',
  }
  return {
    id: instanceId, type: TPL_INSTANCE, position: { x, y },
    render: { title: 'Spawn', category: 'domain' },
    state: { definitionId: def.id, pinBoundary },
    pins: [
      { id: `${instanceId}:exec`,    kind: 'exec', direction: 'in',  type: 'exec',  multiple: false, label: '' },
      { id: `${instanceId}:specs`,   kind: 'data', direction: 'in',  type: 'array', multiple: false, label: 'specs' },
      { id: `${instanceId}:execOut`, kind: 'exec', direction: 'out', type: 'exec',  multiple: false, label: '' },
      { id: `${instanceId}:units`,   kind: 'data', direction: 'out', type: 'array', multiple: true,  label: 'units' },
    ],
  }
}

// ---- helpers --------------------------------------------------------------------------------

function boundaryIn(id: string, type: string, label = ''): XenolithNodeV1 {
  return {
    id, type: TPL_INPUT, position: { x: 0, y: 0 },
    render: { title: label || 'input', category: 'utility' },
    pins: [dout(`${id}:out`, label, type)],
  }
}
function boundaryOut(id: string, type: string, label = ''): XenolithNodeV1 {
  return {
    id, type: TPL_OUTPUT, position: { x: 0, y: 0 },
    render: { title: label || 'output', category: 'utility' },
    pins: [di(`${id}:in`, label, type)],
  }
}
