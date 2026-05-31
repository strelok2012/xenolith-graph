import { describe, it, expect } from 'vitest'
import { elkEngine } from './elk.js'
import type { LayoutGraph } from '../engine.js'

const chain3 = (): LayoutGraph => ({
  nodes: [
    { id: 'A', width: 100, height: 60 },
    { id: 'B', width: 100, height: 60 },
    { id: 'C', width: 100, height: 60 },
  ],
  edges: [
    { id: 'e1', from: { node: 'A' }, to: { node: 'B' } },
    { id: 'e2', from: { node: 'B' }, to: { node: 'C' } },
  ],
})

// Two top-level macros, each containing two leaf nodes. ELK should keep the children inside
// their parent's frame; dagre would ignore `parent` and place all 6 nodes side-by-side.
const nestedScene = (): LayoutGraph => ({
  nodes: [
    { id: 'macroA', width: 320, height: 200 },
    { id: 'macroB', width: 320, height: 200 },
    { id: 'a1', width: 100, height: 50, parent: 'macroA' },
    { id: 'a2', width: 100, height: 50, parent: 'macroA' },
    { id: 'b1', width: 100, height: 50, parent: 'macroB' },
    { id: 'b2', width: 100, height: 50, parent: 'macroB' },
  ],
  edges: [
    { id: 'ea', from: { node: 'a1' }, to: { node: 'a2' } },
    { id: 'eb', from: { node: 'b1' }, to: { node: 'b2' } },
    { id: 'ec', from: { node: 'macroA' }, to: { node: 'macroB' } },
  ],
})

describe('elkEngine', () => {
  it('returns one finite top-left position per node', async () => {
    const r = await elkEngine().layout(chain3(), { direction: 'LR' })
    expect(r.positions.size).toBe(3)
    for (const id of ['A', 'B', 'C']) {
      const p = r.positions.get(id)
      expect(p).toBeDefined()
      expect(Number.isFinite(p!.x)).toBe(true)
      expect(Number.isFinite(p!.y)).toBe(true)
    }
  })

  it('LR direction places source → sink along X', async () => {
    const r = await elkEngine().layout(chain3(), { direction: 'LR' })
    const ax = r.positions.get('A')!.x, bx = r.positions.get('B')!.x, cx = r.positions.get('C')!.x
    expect(ax).toBeLessThan(bx)
    expect(bx).toBeLessThan(cx)
  })

  it('TB direction stacks source → sink along Y', async () => {
    const r = await elkEngine().layout(chain3(), { direction: 'TB' })
    const ay = r.positions.get('A')!.y, by = r.positions.get('B')!.y, cy = r.positions.get('C')!.y
    expect(ay).toBeLessThan(by)
    expect(by).toBeLessThan(cy)
  })

  it('respects nested hierarchy — children land INSIDE their parent rect', async () => {
    const r = await elkEngine().layout(nestedScene(), { direction: 'LR' })
    const ma = r.positions.get('macroA')!, mb = r.positions.get('macroB')!
    const a1 = r.positions.get('a1')!, a2 = r.positions.get('a2')!
    const b1 = r.positions.get('b1')!, b2 = r.positions.get('b2')!
    // Each child's position is INSIDE its parent's rect (top-left ≥ parent top-left).
    expect(a1.x).toBeGreaterThanOrEqual(ma.x); expect(a1.y).toBeGreaterThanOrEqual(ma.y)
    expect(a2.x).toBeGreaterThanOrEqual(ma.x); expect(a2.y).toBeGreaterThanOrEqual(ma.y)
    expect(b1.x).toBeGreaterThanOrEqual(mb.x); expect(b1.y).toBeGreaterThanOrEqual(mb.y)
    expect(b2.x).toBeGreaterThanOrEqual(mb.x); expect(b2.y).toBeGreaterThanOrEqual(mb.y)
    // macroA and macroB must be separated along the LR axis (they're connected).
    expect(Math.abs(ma.x - mb.x)).toBeGreaterThan(0)
  })

  it('engine.name encodes the algorithm', () => {
    expect(elkEngine().name).toBe('elk:layered')
    expect(elkEngine({ algorithm: 'mrtree' }).name).toBe('elk:mrtree')
  })
})
