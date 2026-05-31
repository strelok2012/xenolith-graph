// Mandelbrot graph using first-class primitives:
//   - `GraphInput` / `GraphOutput`         — graph boundary; AS-WASM auto-derives `tickArgs`.
//   - `Local`                              — tick-scoped state cell; one node per storage slot.
//
// The body of the loop is a SHALLOW CHAIN of Local.set nodes wired exec-to-exec (no Sequence node
// in the middle): Loop.body → L:zxn → L:zyn → L:zx → L:zy → L:iter. Each Local's `set` value comes
// from a tiny pure math sub-graph just below it. Reads of `zx/zy/iter` are wires from the SAME
// Local box up to the math nodes.

import type { XenolithGraphV1, XenolithNodeV1, XenolithEdgeV1, XenolithPinV1, XenolithCommentV1 } from '@xenolith/editor'
import type { WidgetSpec } from '@xenolith/core'
import { PRIMITIVE_CATEGORY_COLORS } from '@xenolith/plugin-runtime'

const ei = (id: string): XenolithPinV1 => ({ id, kind: 'exec', direction: 'in', type: 'exec', multiple: false, label: '' })
const eo = (id: string, label = ''): XenolithPinV1 => ({ id, kind: 'exec', direction: 'out', type: 'exec', multiple: false, label })
const di = (id: string, label: string, type: string): XenolithPinV1 => ({ id, kind: 'data', direction: 'in', type, multiple: false, label })
const dout = (id: string, label: string, type: string): XenolithPinV1 => ({ id, kind: 'data', direction: 'out', type, multiple: true, label })

const node = (id: string, type: string, x: number, y: number, pins: XenolithPinV1[], state?: Record<string, unknown>, widgets?: WidgetSpec[], category = 'flow'): XenolithNodeV1 =>
  ({ id, type, position: { x, y }, render: { category }, pins, ...(state ? { state } : {}), ...(widgets ? { widgets } : {}) })
const e = (from: [string, string], to: [string, string]): XenolithEdgeV1 => ({
  id: `e:${from[0]}.${from[1]}->${to[0]}.${to[1]}`,
  from: { node: from[0], pin: from[1] }, to: { node: to[0], pin: to[1] },
})

const nameW  = (): WidgetSpec[] => [{ id: 'name', type: 'text', key: 'name', label: '', pinKey: 'value', visibility: 'always' }]
const valueW = (): WidgetSpec[] => [{ id: 'value', type: 'number', key: 'value', label: '', pinKey: 'out', visibility: 'always' }]

const graphInput  = (id: string, x: number, y: number, name: string): XenolithNodeV1 =>
  node(id, 'GraphInput',  x, y, [dout(`${id}:value`, name, 'scalar')], { name }, nameW(), 'io')
const graphOutput = (id: string, x: number, y: number, name: string): XenolithNodeV1 =>
  node(id, 'GraphOutput', x, y, [ei(`${id}:in`), di(`${id}:value`, name, 'scalar'), eo(`${id}:out`)], { name }, nameW(), 'io')

const local = (id: string, x: number, y: number, name: string, initial = 0): XenolithNodeV1 =>
  node(id, 'Local', x, y, [
    ei(`${id}:in`), di(`${id}:set`, name, 'scalar'), eo(`${id}:out`), dout(`${id}:value`, name, 'scalar'),
  ], { name, initial }, [
    { id: 'name',    type: 'text',   key: 'name',    label: '',       pinKey: 'value', visibility: 'always' },
    { id: 'initial', type: 'number', key: 'initial', label: 'init = ', pinKey: 'set',   visibility: 'always' },
  ], 'state')

// Pin label MUST be 'out' (matches schema + widget pinKey) — otherwise the value-edit widget
// can't bind to a row and the node renders as a read-only label.
const constNode = (id: string, x: number, y: number, value: number): XenolithNodeV1 =>
  node(id, 'Const', x, y, [dout(`${id}:out`, 'out', 'scalar')], { value }, valueW(), 'state')
const mul = (id: string, x: number, y: number): XenolithNodeV1 =>
  node(id, 'Mul', x, y, [di(`${id}:a`, 'a', 'scalar'), di(`${id}:b`, 'b', 'scalar'), dout(`${id}:out`, '×', 'scalar')], undefined, undefined, 'math')
const add = (id: string, x: number, y: number): XenolithNodeV1 =>
  node(id, 'Add', x, y, [di(`${id}:a`, 'a', 'scalar'), di(`${id}:b`, 'b', 'scalar'), dout(`${id}:out`, '+', 'scalar')], undefined, undefined, 'math')
const sub = (id: string, x: number, y: number): XenolithNodeV1 =>
  node(id, 'Sub', x, y, [di(`${id}:a`, 'a', 'scalar'), di(`${id}:b`, 'b', 'scalar'), dout(`${id}:out`, '−', 'scalar')], undefined, undefined, 'math')
const gt  = (id: string, x: number, y: number): XenolithNodeV1 =>
  node(id, 'Gt',  x, y, [di(`${id}:a`, 'a', 'scalar'), di(`${id}:b`, 'b', 'scalar'), dout(`${id}:out`, '>', 'bool')], undefined, undefined, 'math')

// --- layout ---------------------------------------------------------------------------
// Single horizontal band: Tick → Loop on the left, body chain to the right.
// Locals sit above the body chain (so the body's `set` value pulls come from straight up).
// Math expressions sit below (read Locals from above, output up into Locals' `set` pins).
const Y_INPUTS  = -300
const Y_LOCALS  = 0          // Local row
const Y_BODY    = 280        // Loop + chain row
const Y_MATH    = 540        // Math expressions feeding `set` pins
const STEP = 340             // x distance between consecutive stages of the body chain

const COL = {
  TICK:  -STEP * 2,
  LOOP:  -STEP,
  ZXN:    0,
  ZYN:    STEP,
  ZX:     STEP * 2,
  ZY:     STEP * 3,
  ITER:   STEP * 4,
  OUTPUT: STEP * 5,
}

export function mandelbrotV1Graph(): XenolithGraphV1 {
  const nodes: XenolithNodeV1[] = [
    // INPUTS — top row, x-aligned with where they get consumed
    graphInput('in:cx',  COL.ZXN  + 60, Y_INPUTS, 'cx'),
    graphInput('in:cy',  COL.ZYN  + 60, Y_INPUTS, 'cy'),
    graphInput('in:max', COL.LOOP - 50, Y_INPUTS, 'max_iter'),

    // STATE — Local cells. Order matches body chain (zxn, zyn, zx, zy, iter).
    local('L:zxn',  COL.ZXN,  Y_LOCALS, 'zxn',  0),
    local('L:zyn',  COL.ZYN,  Y_LOCALS, 'zyn',  0),
    local('L:zx',   COL.ZX,   Y_LOCALS, 'zx',   0),
    local('L:zy',   COL.ZY,   Y_LOCALS, 'zy',   0),
    local('L:iter', COL.ITER, Y_LOCALS, 'iter', 0),

    // COMPUTE — Tick → Loop → body chain → Output
    node('tick', 'Tick', COL.TICK, Y_BODY, [eo('tick:out')]),
    node('loop', 'Loop', COL.LOOP, Y_BODY, [
      ei('loop:in'),
      di('loop:max', 'max', 'scalar'), di('loop:cond', 'cond', 'bool'),
      dout('loop:idx', 'i', 'scalar'),
      eo('loop:body', 'body'), eo('loop:done', 'done'),
    ]),
    graphOutput('out:iter', COL.OUTPUT, Y_BODY, 'iter'),

    // Cond chain: cond = 4 > (zx² + zy²) — sits ABOVE the loop body, between Locals and Loop.
    constNode('K:four', COL.LOOP - 220, Y_BODY - 220, 4),
    mul('M:zxSqC', COL.LOOP - 220, Y_BODY - 80),
    mul('M:zySqC', COL.LOOP - 220, Y_BODY + 60),
    add('M:magC',  COL.LOOP - 80,  Y_BODY - 30),
    gt ('M:cond',  COL.LOOP - 80,  Y_BODY + 100),

    // BODY chain: each stage's `value` comes from a tiny math sub-graph below; exec flows L→R.
    // Stage 1 — zxn := zx² − zy² + cx   (writes L:zxn)
    mul('M:zxSq',          COL.ZXN - 110, Y_MATH),
    mul('M:zySq',          COL.ZXN - 110, Y_MATH + 140),
    sub('M:zxSqMinusZySq', COL.ZXN + 30,  Y_MATH + 70),
    add('M:zxnExpr',       COL.ZXN + 170, Y_MATH + 70),

    // Stage 2 — zyn := 2 · zx · zy + cy  (writes L:zyn)
    constNode('K:two', COL.ZYN - 110, Y_MATH - 100, 2),
    mul('M:zxzy',     COL.ZYN - 110, Y_MATH + 30),
    mul('M:twoZxZy',  COL.ZYN + 30,  Y_MATH + 30),
    add('M:zynExpr',  COL.ZYN + 170, Y_MATH + 100),

    // Stage 3 — zx ← zxn   (just a wire — no math, set value pulled from L:zxn)
    // Stage 4 — zy ← zyn
    // Stage 5 — iter ← iter + 1
    constNode('K:one', COL.ITER - 110, Y_MATH - 100, 1),
    add('M:incIter',   COL.ITER + 30,  Y_MATH),
  ]

  const edges: XenolithEdgeV1[] = [
    // tick → loop → output(done)
    e(['tick', 'tick:out'],     ['loop', 'loop:in']),
    e(['in:max', 'in:max:value'], ['loop', 'loop:max']),
    e(['loop', 'loop:done'],    ['out:iter', 'out:iter:in']),
    e(['L:iter', 'L:iter:value'], ['out:iter', 'out:iter:value']),

    // cond chain
    e(['L:zx', 'L:zx:value'], ['M:zxSqC', 'M:zxSqC:a']),
    e(['L:zx', 'L:zx:value'], ['M:zxSqC', 'M:zxSqC:b']),
    e(['L:zy', 'L:zy:value'], ['M:zySqC', 'M:zySqC:a']),
    e(['L:zy', 'L:zy:value'], ['M:zySqC', 'M:zySqC:b']),
    e(['M:zxSqC', 'M:zxSqC:out'], ['M:magC', 'M:magC:a']),
    e(['M:zySqC', 'M:zySqC:out'], ['M:magC', 'M:magC:b']),
    e(['K:four',  'K:four:out'],  ['M:cond', 'M:cond:a']),
    e(['M:magC',  'M:magC:out'],  ['M:cond', 'M:cond:b']),
    e(['M:cond',  'M:cond:out'],  ['loop',   'loop:cond']),

    // body chain — exec flows left → right through the Locals
    e(['loop',  'loop:body'], ['L:zxn',  'L:zxn:in']),
    e(['L:zxn', 'L:zxn:out'], ['L:zyn',  'L:zyn:in']),
    e(['L:zyn', 'L:zyn:out'], ['L:zx',   'L:zx:in']),
    e(['L:zx',  'L:zx:out'],  ['L:zy',   'L:zy:in']),
    e(['L:zy',  'L:zy:out'],  ['L:iter', 'L:iter:in']),

    // Stage 1 — L:zxn.set := zx² − zy² + cx
    e(['L:zx', 'L:zx:value'], ['M:zxSq', 'M:zxSq:a']),
    e(['L:zx', 'L:zx:value'], ['M:zxSq', 'M:zxSq:b']),
    e(['L:zy', 'L:zy:value'], ['M:zySq', 'M:zySq:a']),
    e(['L:zy', 'L:zy:value'], ['M:zySq', 'M:zySq:b']),
    e(['M:zxSq', 'M:zxSq:out'], ['M:zxSqMinusZySq', 'M:zxSqMinusZySq:a']),
    e(['M:zySq', 'M:zySq:out'], ['M:zxSqMinusZySq', 'M:zxSqMinusZySq:b']),
    e(['M:zxSqMinusZySq', 'M:zxSqMinusZySq:out'], ['M:zxnExpr', 'M:zxnExpr:a']),
    e(['in:cx', 'in:cx:value'], ['M:zxnExpr', 'M:zxnExpr:b']),
    e(['M:zxnExpr', 'M:zxnExpr:out'], ['L:zxn', 'L:zxn:set']),

    // Stage 2 — L:zyn.set := 2 · zx · zy + cy
    e(['L:zx', 'L:zx:value'], ['M:zxzy', 'M:zxzy:a']),
    e(['L:zy', 'L:zy:value'], ['M:zxzy', 'M:zxzy:b']),
    e(['K:two', 'K:two:out'], ['M:twoZxZy', 'M:twoZxZy:a']),
    e(['M:zxzy', 'M:zxzy:out'], ['M:twoZxZy', 'M:twoZxZy:b']),
    e(['M:twoZxZy', 'M:twoZxZy:out'], ['M:zynExpr', 'M:zynExpr:a']),
    e(['in:cy', 'in:cy:value'], ['M:zynExpr', 'M:zynExpr:b']),
    e(['M:zynExpr', 'M:zynExpr:out'], ['L:zyn', 'L:zyn:set']),

    // Stage 3 — L:zx.set ← L:zxn.value  (and Stage 4 — same idea for zy)
    e(['L:zxn', 'L:zxn:value'], ['L:zx', 'L:zx:set']),
    e(['L:zyn', 'L:zyn:value'], ['L:zy', 'L:zy:set']),

    // Stage 5 — iter += 1
    e(['L:iter', 'L:iter:value'], ['M:incIter', 'M:incIter:a']),
    e(['K:one',  'K:one:out'],    ['M:incIter', 'M:incIter:b']),
    e(['M:incIter', 'M:incIter:out'], ['L:iter', 'L:iter:set']),
  ]

  const comments: XenolithCommentV1[] = [
    {
      id: 'cmt:io',
      position: { x: COL.LOOP - 280, y: Y_INPUTS - 80 },
      size: { x: COL.ITER - COL.LOOP + 320, y: 200 },
      text: 'INPUTS — auto-detected by AS-WASM codegen → tickArgs(cx, cy, max_iter)',
      color: '#4a3a2a',
    },
    {
      id: 'cmt:state',
      position: { x: COL.ZXN - 110, y: Y_LOCALS - 80 },
      size: { x: COL.ITER - COL.ZXN + 280, y: 220 },
      text: 'STATE — 5 tick-scoped Local cells (init = 0). Every read of zx/zy/iter is a wire from ONE box.',
      color: '#2a3a4a',
    },
    {
      id: 'cmt:body',
      position: { x: COL.LOOP - 280, y: Y_BODY - 280 },
      size: { x: COL.OUTPUT - COL.LOOP + 320, y: 980 },
      text: 'COMPUTE — Loop.body chains through Locals: zxn → zyn → zx ← zxn → zy ← zyn → iter++.   Loop.done → Output.',
      color: '#2a4a3a',
    },
  ]

  return { version: 'xenolith.v1', categories: PRIMITIVE_CATEGORY_COLORS, nodes, edges, comments }
}
