import { describe, it, expect } from 'vitest'
import { Runtime, type RtNode, type RtEdge, type RtPin, type RtGraph } from './interpreter.js'
import { BUILTIN_PRIMITIVES } from './primitives.js'

// --- tiny graph builders ----------------------------------------------------------------------
const ein = (id: string): RtPin => ({ id, kind: 'exec', direction: 'in' })
const eout = (id: string): RtPin => ({ id, kind: 'exec', direction: 'out' })
const din = (id: string): RtPin => ({ id, kind: 'data', direction: 'in' })
const dout = (id: string): RtPin => ({ id, kind: 'data', direction: 'out' })
const node = (id: string, type: string, pins: RtPin[], state?: Record<string, unknown>): RtNode =>
  ({ id, type, pins, ...(state ? { state } : {}) })
const edge = (fn: string, fp: string, tn: string, tp: string): RtEdge => ({ from: { node: fn, pin: fp }, to: { node: tn, pin: tp } })

const tick = (id = 'tick'): RtNode => node(id, 'Tick', [eout('out')])
const constN = (id: string, value: unknown): RtNode => node(id, 'Const', [dout('out')], { value })
const add = (id: string): RtNode => node(id, 'Add', [din('a'), din('b'), dout('out')])
const getVar = (id: string, name: string): RtNode => node(id, 'GetVar', [dout('value')], { name })
const setVar = (id: string, name: string): RtNode => node(id, 'SetVar', [ein('in'), din('value'), eout('out')], { name })

const run = (graph: RtGraph, ticks = 1): Runtime => {
  const rt = new Runtime(BUILTIN_PRIMITIVES)
  for (let i = 0; i < ticks; i++) rt.tick(graph)
  return rt
}

describe('pure pull', () => {
  it('lazily evaluates an upstream pure subgraph when an exec node reads its input', () => {
    const graph: RtGraph = {
      nodes: [tick(), setVar('s', 'result'), constN('a', 2), constN('b', 3), add('add')],
      edges: [
        edge('tick', 'out', 's', 'in'),
        edge('a', 'out', 'add', 'a'),
        edge('b', 'out', 'add', 'b'),
        edge('add', 'out', 's', 'value'),
      ],
    }
    expect(run(graph).getVar('result')).toBe(5)
  })
})

describe('state + feedback across ticks', () => {
  it('a variable persists and feeds back into itself (x += 1 each tick)', () => {
    const graph: RtGraph = {
      nodes: [tick(), getVar('g', 'x'), constN('one', 1), add('add'), setVar('s', 'x')],
      edges: [
        edge('tick', 'out', 's', 'in'),
        edge('g', 'value', 'add', 'a'),
        edge('one', 'out', 'add', 'b'),
        edge('add', 'out', 's', 'value'),
      ],
    }
    expect(run(graph, 1).getVar('x')).toBe(1)
    expect(run(graph, 3).getVar('x')).toBe(3) // proves cross-tick persistence
  })
})

describe('Sequence', () => {
  it('fires exec outs in declared order', () => {
    const seq = node('seq', 'Sequence', [ein('in'), eout('then0'), eout('then1')])
    const graph: RtGraph = {
      nodes: [tick(), seq, constN('c1', 1), setVar('s0', 'v'), constN('c2', 2), setVar('s1', 'v')],
      edges: [
        edge('tick', 'out', 'seq', 'in'),
        edge('seq', 'then0', 's0', 'in'),
        edge('c1', 'out', 's0', 'value'),
        edge('seq', 'then1', 's1', 'in'),
        edge('c2', 'out', 's1', 'value'),
      ],
    }
    expect(run(graph).getVar('v')).toBe(2) // then1 (=2) ran after then0 (=1)
  })
})

describe('Branch', () => {
  const build = (cond: boolean): RtGraph => {
    const br = node('br', 'Branch', [ein('in'), din('cond'), eout('true'), eout('false')])
    return {
      nodes: [tick(), br, constN('c', cond), constN('t', 'T'), setVar('sT', 'picked'), constN('f', 'F'), setVar('sF', 'picked')],
      edges: [
        edge('tick', 'out', 'br', 'in'),
        edge('c', 'out', 'br', 'cond'),
        edge('br', 'true', 'sT', 'in'),
        edge('t', 'out', 'sT', 'value'),
        edge('br', 'false', 'sF', 'in'),
        edge('f', 'out', 'sF', 'value'),
      ],
    }
  }
  it('takes the true branch', () => { expect(run(build(true)).getVar('picked')).toBe('T') })
  it('takes the false branch', () => { expect(run(build(false)).getVar('picked')).toBe('F') })
})

describe('ForEach', () => {
  it('runs the body per element, re-reading the element each iteration', () => {
    const fe = node('fe', 'ForEach', [ein('in'), din('array'), dout('element'), dout('index'), eout('body'), eout('completed')])
    const graph: RtGraph = {
      nodes: [tick(), fe, constN('arr', [10, 20, 30]), getVar('g', 'sum'), add('add'), setVar('s', 'sum')],
      edges: [
        edge('tick', 'out', 'fe', 'in'),
        edge('arr', 'out', 'fe', 'array'),
        edge('g', 'value', 'add', 'a'),
        edge('fe', 'element', 'add', 'b'),
        edge('add', 'out', 's', 'value'),
        edge('fe', 'body', 's', 'in'),
      ],
    }
    expect(run(graph).getVar('sum')).toBe(60) // 0+10+20+30, sum accumulated in a var
  })
})

describe('Init entry', () => {
  it('fires only on tick(graph, "Init"), not on a normal tick', () => {
    const graph: RtGraph = {
      nodes: [node('init', 'Init', [eout('out')]), constN('c', 7), setVar('s', 'seeded')],
      edges: [edge('init', 'out', 's', 'in'), edge('c', 'out', 's', 'value')],
    }
    const rt = new Runtime(BUILTIN_PRIMITIVES)
    rt.tick(graph) // default entry 'Tick' — Init must NOT fire
    expect(rt.getVar('seeded')).toBeUndefined()
    rt.tick(graph, 'Init') // construction pass
    expect(rt.getVar('seeded')).toBe(7)
  })
})

describe('Spawn', () => {
  const spawnGraph = (): RtGraph => ({
    nodes: [
      tick(),
      constN('specs', [{ type: 'gift', rate: 0.5 }, { type: 'coin', rate: 1 }]),
      node('spawn', 'Spawn', [ein('in'), din('specs'), dout('units'), eout('out')]),
      setVar('s', 'arrivals'),
    ],
    edges: [
      edge('tick', 'out', 'spawn', 'in'),
      edge('specs', 'out', 'spawn', 'specs'),
      edge('spawn', 'out', 's', 'in'),
      edge('spawn', 'units', 's', 'value'),
    ],
  })

  it('emits a unit each time a fractional rate crosses 1 (accumulates per tick)', () => {
    const rt = new Runtime(BUILTIN_PRIMITIVES)
    const g = spawnGraph()
    rt.tick(g) // gift 0.5, coin 1.0 → ['coin']
    expect(rt.getVar('arrivals')).toEqual(['coin'])
    rt.tick(g) // gift 1.0, coin 1.0 → ['gift','coin']
    expect(rt.getVar('arrivals')).toEqual(['gift', 'coin'])
  })

  it('rate 1 emits exactly one per tick; rate 0 never emits', () => {
    const rt = new Runtime(BUILTIN_PRIMITIVES)
    const g: RtGraph = {
      nodes: [
        tick(),
        constN('specs', [{ type: 'a', rate: 1 }, { type: 'b', rate: 0 }]),
        node('spawn', 'Spawn', [ein('in'), din('specs'), dout('units'), eout('out')]),
        setVar('s', 'out'),
      ],
      edges: [
        edge('tick', 'out', 'spawn', 'in'),
        edge('specs', 'out', 'spawn', 'specs'),
        edge('spawn', 'out', 's', 'in'),
        edge('spawn', 'units', 's', 'value'),
      ],
    }
    rt.tick(g); expect(rt.getVar('out')).toEqual(['a'])
    rt.tick(g); expect(rt.getVar('out')).toEqual(['a'])
  })
})

describe('Struct', () => {
  it('builds the record from per-field state values, keyed by pin id suffix', () => {
    const graph: RtGraph = {
      nodes: [
        tick(),
        node('s', 'Struct', [
          { id: 'Ada:name',     kind: 'data', direction: 'in' },
          { id: 'Ada:salary',   kind: 'data', direction: 'in' },
          dout('self'),
        ], { name: 'Ada', salary: 0.5 }),
        setVar('sv', 'agent'),
      ],
      edges: [
        edge('tick', 'out', 'sv', 'in'),
        edge('s', 'self', 'sv', 'value'),
      ],
    }
    expect(run(graph).getVar('agent')).toEqual({ name: 'Ada', salary: 0.5 })
  })

  it('a Struct with no data-in pins emits an empty object (no fallback to state.data)', () => {
    const graph: RtGraph = {
      nodes: [tick(), node('s', 'Struct', [dout('self')], { data: { ignored: true } }), setVar('sv', 'agent')],
      edges: [edge('tick', 'out', 'sv', 'in'), edge('s', 'self', 'sv', 'value')],
    }
    expect(run(graph).getVar('agent')).toEqual({})
  })

  it('a connected data-in pin overrides the per-field state value (field = pin id after last `:`)', () => {
    const graph: RtGraph = {
      nodes: [
        tick(),
        constN('p', 7),
        node('s', 'Struct', [
          { id: 'Ada:name',     kind: 'data', direction: 'in' },
          { id: 'Ada:priority', kind: 'data', direction: 'in' },
          dout('self'),
        ], { name: 'Ada', priority: 0 }),
        setVar('sv', 'agent'),
      ],
      edges: [
        edge('tick', 'out', 'sv', 'in'),
        edge('p', 'out', 's', 'Ada:priority'),
        edge('s', 'self', 'sv', 'value'),
      ],
    }
    expect(run(graph).getVar('agent')).toEqual({ name: 'Ada', priority: 7 })
  })

  it('multi-input pins do NOT contribute a field (collection-style, skipped)', () => {
    const graph: RtGraph = {
      nodes: [
        tick(),
        constN('g', { type: 'gift' }),
        node('s', 'Struct', [
          { id: 'Ada:subscribe', kind: 'data', direction: 'in', multiple: true },
          { id: 'Ada:name',      kind: 'data', direction: 'in' },
          dout('self'),
        ], { name: 'Ada' }),
        setVar('sv', 'agent'),
      ],
      edges: [
        edge('tick', 'out', 'sv', 'in'),
        edge('g', 'out', 's', 'Ada:subscribe'),
        edge('s', 'self', 'sv', 'value'),
      ],
    }
    // No `subscribe` key — multi pin skipped; only `name` is in the record.
    expect(run(graph).getVar('agent')).toEqual({ name: 'Ada' })
  })

  it('an unconnected data-in pin falls back to state[field]', () => {
    const graph: RtGraph = {
      nodes: [
        tick(),
        node('s', 'Struct', [
          { id: 'Ada:priority', kind: 'data', direction: 'in' },
          dout('self'),
        ], { priority: 0.42 }),
        setVar('sv', 'agent'),
      ],
      edges: [edge('tick', 'out', 'sv', 'in'), edge('s', 'self', 'sv', 'value')],
    }
    expect(run(graph).getVar('agent')).toEqual({ priority: 0.42 })
  })
})

describe('Schema', () => {
  it('emits state.fields as the definition value on its sole data-out pin', () => {
    const fields = { name: 'Ada', priority: 0, salary: 0.5, subs: [] }
    const graph: RtGraph = {
      nodes: [
        tick(),
        node('sc', 'Schema', [dout('definition')], { fields }),
        setVar('sv', 'def'),
      ],
      edges: [edge('tick', 'out', 'sv', 'in'), edge('sc', 'definition', 'sv', 'value')],
    }
    expect(run(graph).getVar('def')).toEqual(fields)
  })

  it('a Schema with no state.fields emits an empty object', () => {
    const graph: RtGraph = {
      nodes: [tick(), node('sc', 'Schema', [dout('definition')]), setVar('sv', 'def')],
      edges: [edge('tick', 'out', 'sv', 'in'), edge('sc', 'definition', 'sv', 'value')],
    }
    expect(run(graph).getVar('def')).toEqual({})
  })
})

describe('Mean', () => {
  it('emits the arithmetic mean of an input array of numbers', () => {
    const graph: RtGraph = {
      nodes: [
        tick(),
        constN('arr', [1, 2, 3, 4]),
        node('m', 'Mean', [din('a'), dout('out')]),
        setVar('s', 'avg'),
      ],
      edges: [
        edge('tick', 'out', 's', 'in'),
        edge('arr', 'out', 'm', 'a'),
        edge('m', 'out', 's', 'value'),
      ],
    }
    expect(run(graph).getVar('avg')).toBe(2.5)
  })

  it('an empty array yields 0 (no NaN)', () => {
    const graph: RtGraph = {
      nodes: [tick(), constN('arr', []), node('m', 'Mean', [din('a'), dout('out')]), setVar('s', 'avg')],
      edges: [edge('tick', 'out', 's', 'in'), edge('arr', 'out', 'm', 'a'), edge('m', 'out', 's', 'value')],
    }
    expect(run(graph).getVar('avg')).toBe(0)
  })

  it('coerces non-number elements via asNumber (matches the rest of the math primitives)', () => {
    const graph: RtGraph = {
      nodes: [tick(), constN('arr', ['2', '4', 6]), node('m', 'Mean', [din('a'), dout('out')]), setVar('s', 'avg')],
      edges: [edge('tick', 'out', 's', 'in'), edge('arr', 'out', 'm', 'a'), edge('m', 'out', 's', 'value')],
    }
    expect(run(graph).getVar('avg')).toBe(4)
  })
})

describe('Runtime.onAfterTick', () => {
  it('fires the listener after every tick, with the graph that ran', () => {
    const calls: number[] = []
    const rt = new Runtime(BUILTIN_PRIMITIVES)
    const off = rt.onAfterTick((g) => calls.push(g.nodes.length))
    const graph: RtGraph = { nodes: [tick()], edges: [] }
    rt.tick(graph); rt.tick(graph)
    expect(calls).toEqual([1, 1])
    off()
    rt.tick(graph)
    expect(calls).toEqual([1, 1]) // unsubscribed
  })

  it('multiple listeners all fire, in registration order', () => {
    const order: string[] = []
    const rt = new Runtime(BUILTIN_PRIMITIVES)
    rt.onAfterTick(() => order.push('a'))
    rt.onAfterTick(() => order.push('b'))
    rt.tick({ nodes: [tick()], edges: [] })
    expect(order).toEqual(['a', 'b'])
  })
})

describe('Index', () => {
  const run1 = (arr: unknown, idx: number): unknown => {
    const g: RtGraph = {
      nodes: [tick(), constN('a', arr), constN('i', idx), node('x', 'Index', [din('a'), din('i'), dout('out')]), setVar('s', 'v')],
      edges: [edge('tick', 'out', 's', 'in'), edge('a', 'out', 'x', 'a'), edge('i', 'out', 'x', 'i'), edge('x', 'out', 's', 'value')],
    }
    return run(g).getVar('v')
  }
  it('returns element at index', () => expect(run1([10, 20, 30], 1)).toBe(20))
  // Index primitive returns `undefined` for OOB/non-array; SetVar coerces undefined→0
  // (`io.input(0) ?? 0`), so downstream observes 0. Algorithms guard with Length first.
  it('idx out of bounds → 0 (undefined coerced by SetVar)',  () => expect(run1([10], 5)).toBe(0))
  it('negative idx → 0 (no Python-style wrap)',              () => expect(run1([10, 20], -1)).toBe(0))
  it('non-array input → 0',                                   () => expect(run1(42, 0)).toBe(0))
})

describe('ArrayWrite', () => {
  const run1 = (arr: unknown, idx: number, val: unknown): unknown => {
    const g: RtGraph = {
      nodes: [tick(), constN('a', arr), constN('i', idx), constN('v', val),
        node('x', 'ArrayWrite', [din('a'), din('i'), din('v'), dout('out')]), setVar('s', 'r')],
      edges: [edge('tick', 'out', 's', 'in'),
        edge('a', 'out', 'x', 'a'), edge('i', 'out', 'x', 'i'), edge('v', 'out', 'x', 'v'),
        edge('x', 'out', 's', 'value')],
    }
    return run(g).getVar('r')
  }
  it('immutable replace at index', () => expect(run1([1, 2, 3], 1, 9)).toEqual([1, 9, 3]))
  it('returns a NEW array (does not mutate input)', () => {
    const before = [1, 2, 3]
    const after = run1(before, 0, 99)
    expect(after).toEqual([99, 2, 3])
    expect(before).toEqual([1, 2, 3])
  })
  it('out-of-bounds idx → unchanged array (no grow, no throw)', () => {
    expect(run1([1, 2], 5, 99)).toEqual([1, 2])
  })
  it('non-array input → [value] at index 0, else []', () => {
    expect(run1(null, 0, 'x')).toEqual([])
  })
})

describe('Includes', () => {
  const run1 = (arr: unknown, item: unknown): unknown => {
    const g: RtGraph = {
      nodes: [tick(), constN('a', arr), constN('i', item),
        node('x', 'Includes', [din('a'), din('i'), dout('out')]), setVar('s', 'r')],
      edges: [edge('tick', 'out', 's', 'in'),
        edge('a', 'out', 'x', 'a'), edge('i', 'out', 'x', 'i'),
        edge('x', 'out', 's', 'value')],
    }
    return run(g).getVar('r')
  }
  it('item in array → true',     () => expect(run1(['a', 'b'], 'b')).toBe(true))
  it('item NOT in array → false', () => expect(run1(['a', 'b'], 'c')).toBe(false))
  it('empty array → false',       () => expect(run1([], 'a')).toBe(false))
  it('non-array → false',         () => expect(run1(42, 'a')).toBe(false))
})

describe('ArgMax', () => {
  const run1 = (arr: unknown): unknown => {
    const g: RtGraph = {
      nodes: [tick(), constN('a', arr), node('x', 'ArgMax', [din('a'), dout('out')]), setVar('s', 'r')],
      edges: [edge('tick', 'out', 's', 'in'), edge('a', 'out', 'x', 'a'), edge('x', 'out', 's', 'value')],
    }
    return run(g).getVar('r')
  }
  it('index of the max value', () => expect(run1([3, 7, 5, 7])).toBe(1)) // ties → first
  it('single element → 0',     () => expect(run1([42])).toBe(0))
  it('empty array → -1',       () => expect(run1([])).toBe(-1))
  it('coerces non-numbers',    () => expect(run1(['1', '2', '3'])).toBe(2))
})

describe('FilterIndices', () => {
  const run1 = (arr: unknown, item: unknown): unknown => {
    const g: RtGraph = {
      nodes: [tick(), constN('a', arr), constN('i', item),
        node('x', 'FilterIndices', [din('a'), din('i'), dout('out')]), setVar('s', 'r')],
      edges: [edge('tick', 'out', 's', 'in'),
        edge('a', 'out', 'x', 'a'), edge('i', 'out', 'x', 'i'),
        edge('x', 'out', 's', 'value')],
    }
    return run(g).getVar('r')
  }
  it('returns indices of arrays containing item', () => {
    expect(run1([['gift', 'coin'], ['coin'], ['gift', 'star']], 'gift')).toEqual([0, 2])
  })
  it('no matches → empty', () => {
    expect(run1([['a'], ['b']], 'z')).toEqual([])
  })
  it('item in every subarray → all indices', () => {
    expect(run1([['x'], ['x', 'y'], ['x']], 'x')).toEqual([0, 1, 2])
  })
  it('non-array element treated as no-match', () => {
    expect(run1([['gift'], 42, ['gift']], 'gift')).toEqual([0, 2])
  })
})

describe('ObjectGet', () => {
  const run1 = (obj: unknown, key: unknown): unknown => {
    const g: RtGraph = {
      nodes: [tick(), constN('o', obj), constN('k', key),
        node('x', 'ObjectGet', [din('o'), din('k'), dout('out')]), setVar('s', 'r')],
      edges: [edge('tick', 'out', 's', 'in'),
        edge('o', 'out', 'x', 'o'), edge('k', 'out', 'x', 'k'),
        edge('x', 'out', 's', 'value')],
    }
    return run(g).getVar('r')
  }
  it('returns obj[key]',                () => expect(run1({ gift: 2, coin: 1.5 }, 'gift')).toBe(2))
  it('missing key → 0 (SetVar coerce)', () => expect(run1({ a: 1 }, 'b')).toBe(0))
  it('non-object input → 0',            () => expect(run1(null, 'a')).toBe(0))
})

describe('IndexAll', () => {
  const run1 = (arr: unknown, idxs: unknown): unknown => {
    const g: RtGraph = {
      nodes: [tick(), constN('a', arr), constN('i', idxs),
        node('x', 'IndexAll', [din('a'), din('i'), dout('out')]), setVar('s', 'r')],
      edges: [edge('tick', 'out', 's', 'in'),
        edge('a', 'out', 'x', 'a'), edge('i', 'out', 'x', 'i'),
        edge('x', 'out', 's', 'value')],
    }
    return run(g).getVar('r')
  }
  it('subset at indices', () => expect(run1([10, 20, 30, 40], [0, 2])).toEqual([10, 30]))
  it('order follows indices, not values', () => expect(run1([10, 20, 30], [2, 0, 1])).toEqual([30, 10, 20]))
  it('OOB indices contribute undefined elements (coerced downstream)', () => {
    expect(run1([1, 2], [0, 5])).toEqual([1, undefined])
  })
  it('empty indices → empty', () => expect(run1([1, 2, 3], [])).toEqual([]))
})

describe('Append', () => {
  const run1 = (arr: unknown, item: unknown): unknown => {
    const g: RtGraph = {
      nodes: [tick(), constN('a', arr), constN('i', item),
        node('x', 'Append', [din('a'), din('i'), dout('out')]), setVar('s', 'r')],
      edges: [edge('tick', 'out', 's', 'in'),
        edge('a', 'out', 'x', 'a'), edge('i', 'out', 'x', 'i'),
        edge('x', 'out', 's', 'value')],
    }
    return run(g).getVar('r')
  }
  it('pushes to end immutably', () => {
    const before = [1, 2]
    expect(run1(before, 3)).toEqual([1, 2, 3])
    expect(before).toEqual([1, 2])
  })
  it('non-array input treated as empty', () => expect(run1(null, 'x')).toEqual(['x']))
})

describe('Floor', () => {
  const run1 = (v: number): unknown => {
    const g: RtGraph = {
      nodes: [tick(), constN('v', v), node('x', 'Floor', [din('v'), dout('out')]), setVar('s', 'r')],
      edges: [edge('tick', 'out', 's', 'in'), edge('v', 'out', 'x', 'v'), edge('x', 'out', 's', 'value')],
    }
    return run(g).getVar('r')
  }
  it('positive: rounds toward 0', () => expect(run1(3.7)).toBe(3))
  it('integer: unchanged',         () => expect(run1(5)).toBe(5))
  it('negative: rounds toward -∞', () => expect(run1(-1.2)).toBe(-2))
  it('zero',                       () => expect(run1(0)).toBe(0))
})

describe('Repeat', () => {
  const run1 = (item: unknown, count: number): unknown => {
    const g: RtGraph = {
      nodes: [tick(), constN('i', item), constN('c', count),
        node('x', 'Repeat', [din('i'), din('c'), dout('out')]), setVar('s', 'r')],
      edges: [edge('tick', 'out', 's', 'in'),
        edge('i', 'out', 'x', 'i'), edge('c', 'out', 'x', 'c'),
        edge('x', 'out', 's', 'value')],
    }
    return run(g).getVar('r')
  }
  it('repeats item N times', () => expect(run1('gift', 3)).toEqual(['gift', 'gift', 'gift']))
  it('zero count → empty',   () => expect(run1('gift', 0)).toEqual([]))
  it('negative count → empty', () => expect(run1('gift', -1)).toEqual([]))
  it('non-integer count: floored', () => expect(run1('gift', 2.7)).toEqual(['gift', 'gift']))
})

describe('ObjectSet', () => {
  const run1 = (obj: unknown, key: unknown, value: unknown): unknown => {
    const g: RtGraph = {
      nodes: [tick(), constN('o', obj), constN('k', key), constN('v', value),
        node('x', 'ObjectSet', [din('o'), din('k'), din('v'), dout('out')]), setVar('s', 'r')],
      edges: [edge('tick', 'out', 's', 'in'),
        edge('o', 'out', 'x', 'o'), edge('k', 'out', 'x', 'k'), edge('v', 'out', 'x', 'v'),
        edge('x', 'out', 's', 'value')],
    }
    return run(g).getVar('r')
  }
  it('sets a new field immutably', () => {
    const before = { a: 1 }
    expect(run1(before, 'b', 2)).toEqual({ a: 1, b: 2 })
    expect(before).toEqual({ a: 1 }) // unchanged
  })
  it('overrides an existing field', () => expect(run1({ a: 1 }, 'a', 99)).toEqual({ a: 99 }))
  it('non-object input treated as {}', () => expect(run1(null, 'a', 1)).toEqual({ a: 1 }))
})

describe('Concat', () => {
  const run1 = (a: unknown, b: unknown): unknown => {
    const g: RtGraph = {
      nodes: [tick(), constN('a', a), constN('b', b),
        node('x', 'Concat', [din('a'), din('b'), dout('out')]), setVar('s', 'r')],
      edges: [edge('tick', 'out', 's', 'in'),
        edge('a', 'out', 'x', 'a'), edge('b', 'out', 'x', 'b'),
        edge('x', 'out', 's', 'value')],
    }
    return run(g).getVar('r')
  }
  it('merges two arrays', () => expect(run1([1, 2], [3, 4])).toEqual([1, 2, 3, 4]))
  it('empty + arr',       () => expect(run1([], [3, 4])).toEqual([3, 4]))
  it('arr + empty',       () => expect(run1([1, 2], [])).toEqual([1, 2]))
  it('non-array sides treated as empty', () => expect(run1(null, [1])).toEqual([1]))
})
