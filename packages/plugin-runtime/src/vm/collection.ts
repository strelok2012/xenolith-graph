// Collection bridge primitives — the link between DOMAIN nodes (Agent/Goodie, editable, addable) and
// the algorithm. They are the only primitives that read/affect nodes ACROSS the graph (via io.nodes),
// so adding/removing a domain node automatically changes what the simulation sees.
//
//   Gather  (pure):   read `field` from every node of `nodeType` → array, ordered by node id.
//   Scatter (impure): take an array → publish it as a var `scatter:<nodeType>:<field>` for the host
//                     to write back onto each node's widget (element i → i-th node, same id order).

import type { NodeDef, RtNode } from './interpreter.js'
import { asArray, type VmValue } from './value.js'

/** Nodes of a type in a stable order (by id) — both Gather and the host's write-back use this so
 *  element i always refers to the same node. */
export function domainNodes(nodes: readonly RtNode[], nodeType: string): RtNode[] {
  return nodes.filter((n) => n.type === nodeType).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

export const SCATTER_VAR_PREFIX = 'scatter:'

const Gather: NodeDef = {
  type: 'Gather',
  pure: true,
  evalPure: (io) => {
    const nodeType = String(io.state('nodeType') ?? '')
    const field = String(io.state('field') ?? '')
    const out = domainNodes(io.nodes(), nodeType).map((n) => (n.state?.[field] ?? 0) as VmValue)
    return [out]
  },
}

const Scatter: NodeDef = {
  type: 'Scatter',
  run: (io) => {
    const nodeType = String(io.state('nodeType') ?? '')
    const field = String(io.state('field') ?? '')
    io.setVar(`${SCATTER_VAR_PREFIX}${nodeType}:${field}`, asArray(io.input(0)))
    io.flow(0)
  },
}

/** Read several fields from every node of a type → array of objects (id order). `fields` is a
 *  comma-separated list. Feeds Spawn (`{type,rate}`) and ToMap straight from domain nodes. */
const GatherRecords: NodeDef = {
  type: 'GatherRecords',
  pure: true,
  evalPure: (io) => {
    const nodeType = String(io.state('nodeType') ?? '')
    const fields = String(io.state('fields') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    const out = domainNodes(io.nodes(), nodeType).map((n) => {
      const rec: Record<string, VmValue> = {}
      for (const f of fields) rec[f] = (n.state?.[f] ?? 0) as VmValue
      return rec
    })
    return [out]
  },
}

/** records[] → object keyed by each record's `key` field, valued by its `value` field. Builds the
 *  `{ type: cost }` map Allocate needs from gathered Goodie records. */
const ToMap: NodeDef = {
  type: 'ToMap',
  pure: true,
  evalPure: (io) => {
    const keyField = String(io.state('key') ?? 'type')
    const valField = String(io.state('value') ?? 'value')
    const obj: Record<string, VmValue> = {}
    for (const r of asArray(io.input(0))) {
      if (r && typeof r === 'object' && !Array.isArray(r)) {
        const rec = r as Record<string, VmValue>
        const v = rec[valField]
        if (v !== undefined) obj[String(rec[keyField])] = v
      }
    }
    return [obj]
  },
}

/** Pure picker: object + field name → value. Pairs with MapField for distilling a record array. */
const GetField: NodeDef = {
  type: 'GetField',
  pure: true,
  evalPure: (io) => {
    const obj = io.input(0)
    const field = String(io.state('field') ?? '')
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [undefined]
    return [(obj as Record<string, VmValue>)[field]]
  },
}

/** Pure map: array of records + field name → array of that field's values. Lets a wire of agent
 *  records become a wire of salaries/priorities/subs without writing a ForEach by hand. */
const MapField: NodeDef = {
  type: 'MapField',
  pure: true,
  evalPure: (io) => {
    const arr = asArray(io.input(0))
    const field = String(io.state('field') ?? '')
    return [arr.map((r) => (r && typeof r === 'object' && !Array.isArray(r) ? (r as Record<string, VmValue>)[field] : undefined) as VmValue)]
  },
}

/** Wire-driven gather (replaces "scan by type" for visible plumbing): the values feeding the single
 *  multi-input pin become an output array, in edge order. So 6 agents wired in → 6-element array. */
const GatherFromInputs: NodeDef = {
  type: 'GatherFromInputs',
  pure: true,
  evalPure: (io) => [io.inputAll(0)],
}

/** Wire-driven scatter (the inverse of GatherFromInputs): takes an array and publishes element i
 *  on the i-th data-out pin, in declared-pin order. Also stashes the array in `scatter-out:<nodeId>`
 *  so a host can harvest it after the tick (per-pin overrides don't survive the tick). Pins are
 *  added per consumer (by the host's auto-connect on node:added). */
const ScatterToOutputs: NodeDef = {
  type: 'ScatterToOutputs',
  run: (io) => {
    const arr = asArray(io.input(0))
    const outs = io.node.pins.filter((p) => p.kind === 'data' && p.direction === 'out').length
    for (let i = 0; i < outs; i++) io.setOutput(i, arr[i] as VmValue)
    io.setVar(`scatter-out:${io.node.id}`, arr)
    io.flow(0)
  },
}

export const OUTPUT_VAR_PREFIX = 'output:'

/** Display the wired value IN-NODE. Publishes the value into VM var `output:<nodeId>` each tick.
 *  Hosts running `Runtime` should mirror those vars onto each Output node's `value` widget via
 *  `editor.setWidgetValue(id, 'value', v, { ephemeral: true })` — one small loop after rt.tick.
 *  The plugin can't do it itself (it has no Runtime reference); the wiring stays one line on the host. */
const Output: NodeDef = {
  type: 'Output',
  run: (io) => {
    io.setVar(`${OUTPUT_VAR_PREFIX}${io.node.id}`, io.input(0) as VmValue)
    io.flow(0)
  },
}

export const COLLECTION_PRIMITIVES: NodeDef[] = [Gather, Scatter, GatherRecords, ToMap, GatherFromInputs, ScatterToOutputs, GetField, MapField, Output]
