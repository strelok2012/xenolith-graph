// Mandelbrot per-pixel iteration count, expressed as an RtGraph. Designed as the showcase for the
// WASM codegen demo: tight numeric loop with cross-tick var state — the kind of work where the
// interpreter is brutally slow and AS-WASM crushes near-native.
//
// Algorithm:
//   for (i = 0; i < MAX && (zx*zx + zy*zy) < 4; i++) {
//     zxn = zx*zx - zy*zy + cx
//     zyn = 2*zx*zy + cy
//     zx, zy = zxn, zyn
//   }
//   return i
//
// Vars (host writes cx/cy/max_iter before each tick, reads iter after):
//   - cx, cy            : pixel mapped to complex plane (input)
//   - max_iter          : iteration cap (input)
//   - iter              : output (final count)
//   - zx, zy            : working state (zeroed each tick by Init phase)
//   - zxn, zyn          : per-iter temps (avoid clobbering zx/zy mid-update)

import type { RtNode, RtEdge, RtGraph, RtPin } from '../vm/interpreter.js'

const ein  = (id: string): RtPin => ({ id, kind: 'exec', direction: 'in'  })
const eout = (id: string): RtPin => ({ id, kind: 'exec', direction: 'out' })
const din  = (id: string): RtPin => ({ id, kind: 'data', direction: 'in'  })
const dout = (id: string): RtPin => ({ id, kind: 'data', direction: 'out' })
const e    = (fn: string, fp: string, tn: string, tp: string): RtEdge => ({ from: { node: fn, pin: fp }, to: { node: tn, pin: tp } })

/** Build the Mandelbrot per-pixel iteration graph. Host sets `cx`, `cy`, `max_iter` vars before
 *  each `tick()`, reads `iter` after. No `max` parameter is baked in — `max_iter` is a var, so
 *  the same compiled module renders any depth. */
export function mandelbrotPixelGraph(): RtGraph {
  // ---- nodes ---------------------------------------------------------------------------------
  const nodes: RtNode[] = [
    { id: 'tick', type: 'Tick', pins: [eout('out')] },

    // Init sequence: zero zx/zy/iter at the start of every tick (so consecutive pixels don't
    // inherit each other's loop state).
    { id: 'initSeq', type: 'Sequence', pins: [ein('in'), eout('zx'), eout('zy'), eout('iter'), eout('loop')] },
    { id: 'zero', type: 'Const', pins: [dout('out')], state: { value: 0 } },
    { id: 'setInitZx',   type: 'SetVar', pins: [ein('in'), din('v'), eout('out')], state: { name: 'zx' } },
    { id: 'setInitZy',   type: 'SetVar', pins: [ein('in'), din('v'), eout('out')], state: { name: 'zy' } },
    { id: 'setInitIter', type: 'SetVar', pins: [ein('in'), din('v'), eout('out')], state: { name: 'iter' } },

    // Loop: max iterations + cond (zx*zx + zy*zy < 4)
    { id: 'loop',     type: 'Loop',   pins: [ein('in'), din('max'), din('cond'), dout('idx'), eout('body'), eout('done')] },
    { id: 'getMax',   type: 'GetVar', pins: [dout('value')], state: { name: 'max_iter' } },

    // Loop cond: 4 > (zx*zx + zy*zy)   [Gt(a, b) = a > b ? 1 : 0]
    { id: 'four', type: 'Const', pins: [dout('out')], state: { value: 4 } },
    { id: 'getZxC', type: 'GetVar', pins: [dout('value')], state: { name: 'zx' } },
    { id: 'getZyC', type: 'GetVar', pins: [dout('value')], state: { name: 'zy' } },
    { id: 'zxSqC',  type: 'Mul',    pins: [din('a'), din('b'), dout('out')] }, // zx*zx
    { id: 'zySqC',  type: 'Mul',    pins: [din('a'), din('b'), dout('out')] }, // zy*zy
    { id: 'magC',   type: 'Add',    pins: [din('a'), din('b'), dout('out')] }, // zx² + zy²
    { id: 'cond',   type: 'Gt',     pins: [din('a'), din('b'), dout('out')] }, // 4 > mag

    // Body sequence: compute zxn, zyn (using OLD zx,zy), then commit zx←zxn, zy←zyn, iter←iter+1.
    // Crucially zxn/zyn are computed BEFORE zx/zy are overwritten — that's why we need temps.
    { id: 'bodySeq', type: 'Sequence', pins: [ein('in'), eout('zxn'), eout('zyn'), eout('commitZx'), eout('commitZy'), eout('iter')] },

    // zxn = zx*zx - zy*zy + cx
    { id: 'getZxB', type: 'GetVar', pins: [dout('value')], state: { name: 'zx' } },
    { id: 'getZyB', type: 'GetVar', pins: [dout('value')], state: { name: 'zy' } },
    { id: 'getCx',  type: 'GetVar', pins: [dout('value')], state: { name: 'cx' } },
    { id: 'getCy',  type: 'GetVar', pins: [dout('value')], state: { name: 'cy' } },
    { id: 'zxSq',   type: 'Mul', pins: [din('a'), din('b'), dout('out')] },     // zx*zx
    { id: 'zySq',   type: 'Mul', pins: [din('a'), din('b'), dout('out')] },     // zy*zy
    { id: 'zxSqMinusZySq', type: 'Sub', pins: [din('a'), din('b'), dout('out')] },
    { id: 'zxnExpr', type: 'Add', pins: [din('a'), din('b'), dout('out')] },    // (zx²−zy²) + cx
    { id: 'setZxn',  type: 'SetVar', pins: [ein('in'), din('v'), eout('out')], state: { name: 'zxn' } },

    // zyn = 2*zx*zy + cy
    { id: 'two',     type: 'Const', pins: [dout('out')], state: { value: 2 } },
    { id: 'zxzy',    type: 'Mul', pins: [din('a'), din('b'), dout('out')] },    // zx*zy
    { id: 'twoZxZy', type: 'Mul', pins: [din('a'), din('b'), dout('out')] },    // 2 * zxzy
    { id: 'zynExpr', type: 'Add', pins: [din('a'), din('b'), dout('out')] },    // 2zxzy + cy
    { id: 'setZyn',  type: 'SetVar', pins: [ein('in'), din('v'), eout('out')], state: { name: 'zyn' } },

    // zx ← zxn ; zy ← zyn
    { id: 'getZxn', type: 'GetVar', pins: [dout('value')], state: { name: 'zxn' } },
    { id: 'getZyn', type: 'GetVar', pins: [dout('value')], state: { name: 'zyn' } },
    { id: 'commitZx', type: 'SetVar', pins: [ein('in'), din('v'), eout('out')], state: { name: 'zx' } },
    { id: 'commitZy', type: 'SetVar', pins: [ein('in'), din('v'), eout('out')], state: { name: 'zy' } },

    // iter ← iter + 1
    { id: 'getIter', type: 'GetVar', pins: [dout('value')], state: { name: 'iter' } },
    { id: 'one',     type: 'Const',  pins: [dout('out')], state: { value: 1 } },
    { id: 'incIter', type: 'Add',    pins: [din('a'), din('b'), dout('out')] },
    { id: 'commitIter', type: 'SetVar', pins: [ein('in'), din('v'), eout('out')], state: { name: 'iter' } },
  ]

  // ---- edges ---------------------------------------------------------------------------------
  const edges: RtEdge[] = [
    // tick → initSeq
    e('tick', 'out', 'initSeq', 'in'),
    // init: zx=0, zy=0, iter=0
    e('initSeq', 'zx',   'setInitZx',   'in'), e('zero', 'out', 'setInitZx',   'v'),
    e('initSeq', 'zy',   'setInitZy',   'in'), e('zero', 'out', 'setInitZy',   'v'),
    e('initSeq', 'iter', 'setInitIter', 'in'), e('zero', 'out', 'setInitIter', 'v'),
    // init → loop
    e('initSeq', 'loop', 'loop', 'in'),
    e('getMax',  'value', 'loop', 'max'),
    e('cond',    'out',   'loop', 'cond'),

    // cond chain: zxSqC = zx*zx; zySqC = zy*zy; magC = zxSqC + zySqC; cond = (4 > magC)
    e('getZxC', 'value', 'zxSqC', 'a'),  e('getZxC', 'value', 'zxSqC', 'b'),
    e('getZyC', 'value', 'zySqC', 'a'),  e('getZyC', 'value', 'zySqC', 'b'),
    e('zxSqC',  'out',   'magC',  'a'),  e('zySqC',  'out',   'magC',  'b'),
    e('four',   'out',   'cond',  'a'),  e('magC',   'out',   'cond',  'b'),

    // loop.body → bodySeq
    e('loop', 'body', 'bodySeq', 'in'),

    // body: zxn first
    e('bodySeq', 'zxn', 'setZxn', 'in'),
    e('getZxB', 'value', 'zxSq', 'a'),  e('getZxB', 'value', 'zxSq', 'b'),
    e('getZyB', 'value', 'zySq', 'a'),  e('getZyB', 'value', 'zySq', 'b'),
    e('zxSq',   'out', 'zxSqMinusZySq', 'a'),
    e('zySq',   'out', 'zxSqMinusZySq', 'b'),
    e('zxSqMinusZySq', 'out', 'zxnExpr', 'a'),
    e('getCx',  'value', 'zxnExpr', 'b'),
    e('zxnExpr', 'out', 'setZxn', 'v'),

    // body: zyn next
    e('bodySeq', 'zyn', 'setZyn', 'in'),
    e('getZxB', 'value', 'zxzy', 'a'),  e('getZyB', 'value', 'zxzy', 'b'),
    e('two',    'out',   'twoZxZy', 'a'),
    e('zxzy',   'out',   'twoZxZy', 'b'),
    e('twoZxZy', 'out',  'zynExpr', 'a'),
    e('getCy',  'value', 'zynExpr', 'b'),
    e('zynExpr', 'out',  'setZyn', 'v'),

    // body: commit zx ← zxn, zy ← zyn
    e('bodySeq', 'commitZx', 'commitZx', 'in'),
    e('getZxn',  'value',    'commitZx', 'v'),
    e('bodySeq', 'commitZy', 'commitZy', 'in'),
    e('getZyn',  'value',    'commitZy', 'v'),

    // body: iter += 1
    e('bodySeq', 'iter', 'commitIter', 'in'),
    e('getIter', 'value', 'incIter', 'a'),
    e('one',     'out',   'incIter', 'b'),
    e('incIter', 'out',   'commitIter', 'v'),
  ]

  return {
    nodes, edges,
    // Codegen hint: cx/cy/max_iter are pure inputs (host writes, body reads); iter is the pure
    // output (body writes, host reads). Lets AS-WASM emit a `tickArgs(cx, cy, max): iter` entry
    // that bypasses set/getVar — apples-to-apples comparison with the reference fn.
    meta: { inputs: ['cx', 'cy', 'max_iter'], outputs: ['iter'] },
  }
}

/** Reference impl in plain JS — the bar every engine must match per-pixel. */
export function mandelbrotPixelReference(cx: number, cy: number, maxIter: number): number {
  let zx = 0, zy = 0, i = 0
  while (i < maxIter && zx * zx + zy * zy < 4) {
    const zxn = zx * zx - zy * zy + cx
    const zyn = 2 * zx * zy + cy
    zx = zxn; zy = zyn
    i++
  }
  return i
}
