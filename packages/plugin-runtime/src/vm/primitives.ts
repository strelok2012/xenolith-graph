// Tier-1 primitives (a starter subset of the UE-K2 vocabulary). Pins are addressed BY INDEX (see
// interpreter.ts), so the declared pin ORDER in a node's schema is the contract. Domain verbs
// (Allocate, …) are composed from these — they are NOT bespoke nodes.

import type { NodeDef } from './interpreter.js'
import { asArray, asBool, asNumber, type VmValue } from './value.js'

// --- exec flow ---------------------------------------------------------------------------------

/** Entry point. The interpreter fires every Tick node each step; it just kicks the exec wire. */
const Tick: NodeDef = { type: 'Tick', run: (io) => io.flow(0) }

/** Construction entry — fired ONCE via `runtime.tick(graph, 'Init')` to seed variables before the
 *  first Tick. Identical shape to Tick; separate type so the host can run a one-off init flow. */
const Init: NodeDef = { type: 'Init', run: (io) => io.flow(0) }

/** Fractional spawner: input 0 = array of {type, rate}; emits an array of type-strings this tick by
 *  accumulating each rate and emitting one unit per whole crossed (0.1 ⇒ ~1 every 10 ticks). Keeps a
 *  per-node accumulator in a VM variable keyed by node id (Spawn is stateful across ticks). */
const Spawn: NodeDef = {
  type: 'Spawn',
  run: (io) => {
    const specs = asArray(io.input(0)) as Array<{ type: string; rate: number }>
    const accKey = `__spawn:${io.node.id}`
    const acc = (io.getVar(accKey) as Record<string, number> | undefined) ?? {}
    const out: VmValue[] = []
    for (const s of specs) {
      let a = (acc[s.type] ?? 0) + asNumber(s.rate)
      while (a >= 1) { out.push(s.type); a -= 1 }
      acc[s.type] = a
    }
    io.setVar(accKey, acc as unknown as VmValue)
    io.setOutput(0, out)
    io.flow(0)
  },
}

/** Fire each exec out-pin in declared order (then0, then1, …). */
const Sequence: NodeDef = {
  type: 'Sequence',
  run: (io) => {
    const count = io.node.pins.filter((p) => p.kind === 'exec' && p.direction === 'out').length
    for (let i = 0; i < count; i++) io.flow(i)
  },
}

/** Branch on a boolean: exec-out 0 = true, 1 = false. */
const Branch: NodeDef = {
  type: 'Branch',
  run: (io) => io.flow(asBool(io.input(0)) ? 0 : 1),
}

/** For each element of input 0: publish data-out 0 = element, 1 = index; run exec-out 0 (body);
 *  then exec-out 1 (completed). */
const ForEach: NodeDef = {
  type: 'ForEach',
  run: (io) => {
    const arr = asArray(io.input(0))
    for (let i = 0; i < arr.length; i++) {
      io.setOutput(0, arr[i] as VmValue)
      io.setOutput(1, i)
      io.flow(0)
    }
    io.flow(1)
  },
}

/** Write a variable (name from the `name` widget) = input 0; then continue (exec-out 0). */
const SetVar: NodeDef = {
  type: 'SetVar',
  run: (io) => {
    const name = String(io.state('name') ?? '')
    if (name) io.setVar(name, io.input(0) ?? 0)
    io.flow(0)
  },
}

// --- pure --------------------------------------------------------------------------------------

const GetVar: NodeDef = {
  type: 'GetVar',
  pure: true,
  evalPure: (io) => [io.getVar(String(io.state('name') ?? '')) ?? 0],
}

/** Literal from the `value` widget. */
const Const: NodeDef = {
  type: 'Const',
  pure: true,
  evalPure: (io) => [(io.state('value') as VmValue | undefined) ?? 0],
}

/** Field name for a Struct's data-in pin: the suffix after the LAST `:` in the pin id, or the
 *  whole id when there's no separator. Lets per-instance pins use `${nodeId}:${field}` naming
 *  while staying unambiguous to the evaluator. */
function structFieldName(pinId: string): string {
  const i = pinId.lastIndexOf(':')
  return i < 0 ? pinId : pinId.slice(i + 1)
}

/** Generic record carrier. Replaces bespoke domain nodes (Agent/Goodie/…) — a Struct is just a
 *  bag of typed fields, ONE PIN PER FIELD plus a `self` out emitting the assembled record.
 *  - field NAME = the pin id after the last `:` (see {@link structFieldName}).
 *  - field VALUE = `io.input(i)` when the pin is wired, else `io.state(field)` (so an in-node
 *    widget bound to that pin via `WidgetSpec.pinKey` editorialises the same key).
 *  - Multi-input pins (e.g. an Agent's `subscribe` collecting goodie records) DO NOT contribute
 *    a field — they're collection-style and a downstream primitive consumes them.
 *  - A Struct with no data-in pins emits `{}` — empty record. */
const Struct: NodeDef = {
  type: 'Struct',
  pure: true,
  evalPure: (io) => {
    const dataIns = io.node.pins.filter((p) => p.kind === 'data' && p.direction === 'in')
    const out: { [k: string]: VmValue } = {}
    for (let i = 0; i < dataIns.length; i++) {
      const pin = dataIns[i]!
      if (pin.multiple) continue
      const field = structFieldName(String(pin.id))
      const wired = io.input(i)
      const value = wired !== undefined ? wired : (io.state(field) as VmValue | undefined)
      if (value !== undefined) out[field] = value
    }
    return [out]
  },
}

/** Field definitions consumed by a Struct via its `schema` in-pin. `state.fields` is an object
 *  `{ fieldName: defaultValue }`; the Struct synthesizes one in-pin per key (with type inferred
 *  from the default's runtime type). Replaces hand-writing pins+widgets on every Struct instance. */
const Schema: NodeDef = {
  type: 'Schema',
  pure: true,
  evalPure: (io) => [(io.state('fields') as VmValue | undefined) ?? {}],
}

const binary = (type: string, op: (a: number, b: number) => number): NodeDef => ({
  type,
  pure: true,
  evalPure: (io) => [op(asNumber(io.input(0)), asNumber(io.input(1)))],
})

const Add = binary('Add', (a, b) => a + b)
const Sub = binary('Sub', (a, b) => a - b)
const Mul = binary('Mul', (a, b) => a * b)

// --- array math (elementwise; the collection plumbing for per-entity fields) -------------------

/** Elementwise add of two numeric arrays (input 0 + input 1; length = input 0). */
const ZipAdd: NodeDef = {
  type: 'ZipAdd',
  pure: true,
  evalPure: (io) => {
    const a = asArray(io.input(0))
    const b = asArray(io.input(1))
    return [a.map((v, i) => asNumber(v) + asNumber(b[i]))]
  },
}

/** Multiply every element of input 0 (array) by input 1 (scalar k). */
const ScaleArray: NodeDef = {
  type: 'ScaleArray',
  pure: true,
  evalPure: (io) => {
    const k = asNumber(io.input(1))
    return [asArray(io.input(0)).map((v) => asNumber(v) * k)]
  },
}

const Length: NodeDef = {
  type: 'Length',
  pure: true,
  evalPure: (io) => [asArray(io.input(0)).length],
}

/** Element at `idx` in `array`. Out-of-bounds and non-arrays → undefined (no Python wrap, no throw). */
const Index: NodeDef = {
  type: 'Index',
  pure: true,
  evalPure: (io) => {
    const arr = io.input(0)
    const idx = asNumber(io.input(1))
    if (!Array.isArray(arr)) return [undefined]
    if (!Number.isInteger(idx) || idx < 0 || idx >= arr.length) return [undefined]
    return [arr[idx] as VmValue]
  },
}

/** Immutable replace: a NEW array with `array[idx] = value`. Out-of-bounds → array unchanged. */
const ArrayWrite: NodeDef = {
  type: 'ArrayWrite',
  pure: true,
  evalPure: (io) => {
    const arr = io.input(0)
    const idx = asNumber(io.input(1))
    const val = io.input(2) as VmValue
    if (!Array.isArray(arr)) return [[]]
    if (!Number.isInteger(idx) || idx < 0 || idx >= arr.length) return [[...arr]]
    const out = [...arr]
    out[idx] = val
    return [out as VmValue]
  },
}

/** `array.includes(item)`. Non-arrays → false. Strict equality. */
const Includes: NodeDef = {
  type: 'Includes',
  pure: true,
  evalPure: (io) => {
    const arr = io.input(0)
    const item = io.input(1) as VmValue
    if (!Array.isArray(arr)) return [false]
    return [arr.includes(item)]
  },
}

/** Index of the max value (ties → first). Empty → -1. Non-array → -1. */
const ArgMax: NodeDef = {
  type: 'ArgMax',
  pure: true,
  evalPure: (io) => {
    const arr = io.input(0)
    if (!Array.isArray(arr) || arr.length === 0) return [-1]
    let bestI = 0
    let bestV = asNumber(arr[0])
    for (let i = 1; i < arr.length; i++) {
      const v = asNumber(arr[i])
      if (v > bestV) { bestV = v; bestI = i }
    }
    return [bestI]
  },
}

/** Indices of sub-arrays containing `item`. `array` MUST be an array of arrays; sub-arrays that
 *  aren't arrays are treated as no-match (no throw). Used by Allocate-as-template to find which
 *  agents subscribe to a given unit type. */
const FilterIndices: NodeDef = {
  type: 'FilterIndices',
  pure: true,
  evalPure: (io) => {
    const arr = io.input(0)
    const item = io.input(1) as VmValue
    if (!Array.isArray(arr)) return [[]]
    const out: number[] = []
    for (let i = 0; i < arr.length; i++) {
      const sub = arr[i]
      if (Array.isArray(sub) && sub.includes(item)) out.push(i)
    }
    return [out]
  },
}

/** a > b → bool. Numeric compare. */
const Gt: NodeDef = {
  type: 'Gt',
  pure: true,
  evalPure: (io) => [asNumber(io.input(0)) > asNumber(io.input(1))],
}
/** a >= b → bool. */
const Gte: NodeDef = {
  type: 'Gte',
  pure: true,
  evalPure: (io) => [asNumber(io.input(0)) >= asNumber(io.input(1))],
}
/** a == b → bool (strict equality). */
const Eq: NodeDef = {
  type: 'Eq',
  pure: true,
  evalPure: (io) => [io.input(0) === io.input(1)],
}

/** Dynamic field lookup on an object: `obj[key]`. Non-object → undefined. */
const ObjectGet: NodeDef = {
  type: 'ObjectGet',
  pure: true,
  evalPure: (io) => {
    const obj = io.input(0)
    const key = io.input(1)
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [undefined]
    if (key === undefined || key === null) return [undefined]
    const k = String(key)
    return [(obj as Record<string, VmValue>)[k]]
  },
}

/** Subset of `array` at the given `indices` (in order). OOB indices yield `undefined` elements. */
const IndexAll: NodeDef = {
  type: 'IndexAll',
  pure: true,
  evalPure: (io) => {
    const arr = io.input(0)
    const idxs = io.input(1)
    if (!Array.isArray(arr) || !Array.isArray(idxs)) return [[]]
    return [idxs.map((i) => arr[asNumber(i)] as VmValue)]
  },
}

/** Immutable push: a NEW array with `item` appended. Non-array → `[item]`. */
const Append: NodeDef = {
  type: 'Append',
  pure: true,
  evalPure: (io) => {
    const arr = io.input(0)
    const item = io.input(1) as VmValue
    if (!Array.isArray(arr)) return [[item]]
    return [[...arr, item]]
  },
}

/** Arithmetic mean of an input array. Empty array → 0 (not NaN — lets metrics widgets show 0
 *  cleanly before the simulation has produced any data). Elements coerced via `asNumber`. */
const Mean: NodeDef = {
  type: 'Mean',
  pure: true,
  evalPure: (io) => {
    const arr = asArray(io.input(0))
    if (arr.length === 0) return [0]
    let sum = 0
    for (const v of arr) sum += asNumber(v)
    return [sum / arr.length]
  },
}

/** The starter primitive set. */
export const BUILTIN_PRIMITIVES: NodeDef[] = [
  Tick, Init, Spawn, Sequence, Branch, ForEach, SetVar, GetVar, Const, Struct, Schema, Add, Sub, Mul, ZipAdd, ScaleArray, Length, Mean,
  Index, ArrayWrite, Includes, ArgMax, FilterIndices, ObjectGet, IndexAll, Append, Gt, Gte, Eq,
]
