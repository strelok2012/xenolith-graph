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

/** The starter primitive set. */
export const BUILTIN_PRIMITIVES: NodeDef[] = [
  Tick, Init, Spawn, Sequence, Branch, ForEach, SetVar, GetVar, Const, Add, Sub, Mul, ZipAdd, ScaleArray, Length,
]
