// Allocate as a TemplateDefinition — the sub-graph from `allocate-graph-v1.ts` wrapped behind
// `$templateInput` / `$templateOutput` boundary nodes, plus a single `$templateInstance` node
// for the outer graph. Visually one Allocate node in the canvas; dive into it to see the
// primitive sub-graph.
//
// V1 serialization shape: `templates: TemplateDefinition[]` + outer `nodes: [..., $templateInstance]`.

import type { XenolithNodeV1, XenolithPinV1, XenolithEdgeV1 } from '@xenolith/editor'
import type { TemplateDefinition } from '@xenolith/core'
import { buildAllocateSubgraphV1 } from './allocate-graph-v1.js'

const TPL_INPUT  = '$templateInput'  as const
const TPL_OUTPUT = '$templateOutput' as const
const TPL_INSTANCE = '$templateInstance' as const

const di = (id: string, label: string, type: string): XenolithPinV1 => ({ id, kind: 'data', direction: 'in',  type, multiple: false, label })
const dout = (id: string, label: string, type: string): XenolithPinV1 => ({ id, kind: 'data', direction: 'out', type, multiple: true, label })

/** Build an Allocate TemplateDefinition: boundary input/output nodes for the 5 inputs (exec +
 *  priorities + subs + arrivals + costs) and 4 outputs (exec + priorities + awards + leftovers)
 *  wrapped around the primitive sub-graph from `buildAllocateSubgraphV1`. */
export function buildAllocateTemplateDefinition(): TemplateDefinition {
  const defId = 'tpl:allocate'

  // Boundary nodes. Each has ONE pin — $templateInput has an OUT pin feeding members, $templateOutput
  // has an IN pin drained by members. Boundary node id IS the stable interface key (templateInterface).
  const inExec  = boundaryIn('tplIn:exec',       'exec')   // exec input
  const inP     = boundaryIn('tplIn:priorities', 'array',  'priorities')
  const inSubs  = boundaryIn('tplIn:subs',       'array',  'subs')
  const inArr   = boundaryIn('tplIn:arrivals',   'array',  'arrivals')
  const inCosts = boundaryIn('tplIn:costs',      'object', 'costs')

  const outExec       = boundaryOut('tplOut:exec',       'exec')
  const outPriorities = boundaryOut('tplOut:priorities', 'array', 'priorities')
  const outAwards     = boundaryOut('tplOut:awards',     'array', 'awards')
  const outLeftovers  = boundaryOut('tplOut:leftovers',  'array', 'leftovers')

  // Build the primitive sub-graph, sourcing each input from the matching boundary's OUT pin.
  const sub = buildAllocateSubgraphV1('alloc', 200, 0, {
    exec:       { node: inExec.id,  pin: inExec.pins[0]!.id },
    priorities: { node: inP.id,     pin: inP.pins[0]!.id },
    subs:       { node: inSubs.id,  pin: inSubs.pins[0]!.id },
    arrivals:   { node: inArr.id,   pin: inArr.pins[0]!.id },
    costs:      { node: inCosts.id, pin: inCosts.pins[0]!.id },
  })

  // Wire sub's outputs into the $templateOutput boundary nodes' IN pins.
  const drainEdges: XenolithEdgeV1[] = [
    { id: 'tplE:exec',  from: { node: sub.out.exec.node,       pin: sub.out.exec.pin },       to: { node: outExec.id,       pin: outExec.pins[0]!.id } },
    { id: 'tplE:p',     from: { node: sub.out.priorities.node, pin: sub.out.priorities.pin }, to: { node: outPriorities.id, pin: outPriorities.pins[0]!.id } },
    { id: 'tplE:aw',    from: { node: sub.out.awards.node,     pin: sub.out.awards.pin },     to: { node: outAwards.id,     pin: outAwards.pins[0]!.id } },
    { id: 'tplE:lo',    from: { node: sub.out.leftovers.node,  pin: sub.out.leftovers.pin },  to: { node: outLeftovers.id,  pin: outLeftovers.pins[0]!.id } },
  ]

  return {
    id: defId as TemplateDefinition['id'],
    title: 'Allocate',
    // Boundary nodes first (left side / right side of the dived view), then members in between.
    nodes: [
      inExec, inP, inSubs, inArr, inCosts,
      ...(sub.nodes as unknown as TemplateDefinition['nodes']),
      outExec, outPriorities, outAwards, outLeftovers,
    ] as TemplateDefinition['nodes'],
    edges: [
      ...(sub.edges as unknown as TemplateDefinition['edges']),
      ...(drainEdges as unknown as TemplateDefinition['edges']),
    ] as TemplateDefinition['edges'],
  }
}

/** Pin ids the editor mints on a `$templateInstance` MUST be stable — they're the values the
 *  outer-graph wires reference. We use the boundary-node id (which is also stable) as the pin
 *  id; the editor matches by boundary identity on dive/re-sync. */
export function buildAllocateInstance(
  instanceId: string,
  x: number,
  y: number,
): XenolithNodeV1 {
  const def = buildAllocateTemplateDefinition()
  return {
    id: instanceId, type: TPL_INSTANCE, position: { x, y },
    render: { title: 'Allocate', category: 'domain' },
    state: { definitionId: def.id },
    pins: [
      // Order MUST match templateInterface (boundary appearance in def.nodes).
      { id: `${instanceId}:exec`,       kind: 'exec', direction: 'in',  type: 'exec',   multiple: false, label: '' },
      { id: `${instanceId}:priorities`, kind: 'data', direction: 'in',  type: 'array',  multiple: false, label: 'priorities' },
      { id: `${instanceId}:subs`,       kind: 'data', direction: 'in',  type: 'array',  multiple: false, label: 'subs' },
      { id: `${instanceId}:arrivals`,   kind: 'data', direction: 'in',  type: 'array',  multiple: false, label: 'arrivals' },
      { id: `${instanceId}:costs`,      kind: 'data', direction: 'in',  type: 'object', multiple: false, label: 'costs' },
      { id: `${instanceId}:execOut`,    kind: 'exec', direction: 'out', type: 'exec',   multiple: false, label: '' },
      { id: `${instanceId}:priorities_out`, kind: 'data', direction: 'out', type: 'array', multiple: true, label: 'priorities' },
      { id: `${instanceId}:awards`,         kind: 'data', direction: 'out', type: 'array', multiple: true, label: 'awards' },
      { id: `${instanceId}:leftovers`,      kind: 'data', direction: 'out', type: 'array', multiple: true, label: 'leftovers' },
    ],
  }
}

// ---- helpers ---------------------------------------------------------------------------------

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
