import { describe, it, expect } from 'vitest'
import type { Node, Edge } from './graph.js'
import type { NodeId, PinId, EdgeId } from './ids.js'
import { MACRO_TYPE, flattenMacroProxies } from './macro.js'
import type { MacroProxyRecord } from './macro.js'

const node = (id: string, type = 'Step'): Node => ({
  id: id as NodeId, type, position: { x: 0, y: 0 }, state: {}, pins: [],
})
const edge = (id: string, fn: string, fp: string, tn: string, tp: string): Edge => ({
  id: id as EdgeId, from: { node: fn as NodeId, pin: fp as PinId }, to: { node: tn as NodeId, pin: tp as PinId },
})
const proxy = (over: { macroPin?: string; direction?: 'in' | 'out'; memberNode?: string; memberPin?: string }): MacroProxyRecord => ({
  edgeId: 'pe' as EdgeId,
  macroPin: (over.macroPin ?? 'mp') as PinId,
  direction: over.direction ?? 'in',
  externalNode: 'x' as NodeId, externalPin: 'xp' as PinId,
  memberNode: (over.memberNode ?? 'm') as NodeId,
  memberPin: (over.memberPin ?? 'mpin') as PinId,
})
const macro = (id: string, members: string[], proxyMap: MacroProxyRecord[]): Node => ({
  id: id as NodeId, type: MACRO_TYPE, position: { x: 0, y: 0 },
  state: { members, collapsed: true, proxyMap }, pins: [],
})

describe('flattenMacroProxies', () => {
  it('drops macro nodes and remaps proxy-pin edges to member pins', () => {
    // ext → macro.inProxy (bridges member m1.in); m1 → m2 internal; m2.out → macro.outProxy → ext2
    const nodes = [
      node('ext'), node('ext2'), node('m1'), node('m2'),
      macro('M', ['m1', 'm2'], [
        proxy({ macroPin: 'M.in', direction: 'in', memberNode: 'm1', memberPin: 'm1.i' }),
        proxy({ macroPin: 'M.out', direction: 'out', memberNode: 'm2', memberPin: 'm2.o' }),
      ]),
    ]
    const edges = [
      edge('e0', 'ext', 'ext.o', 'M', 'M.in'),
      edge('e1', 'm1', 'm1.o', 'm2', 'm2.i'),
      edge('e2', 'M', 'M.out', 'ext2', 'ext2.i'),
    ]
    const flat = flattenMacroProxies(nodes, edges)
    expect(flat.nodes.map((n) => n.id).sort()).toEqual(['ext', 'ext2', 'm1', 'm2'])
    expect(flat.nodes.some((n) => n.type === MACRO_TYPE)).toBe(false)
    const find = (id: string) => flat.edges.find((e) => e.id === id)!
    expect(find('e0').to).toEqual({ node: 'm1', pin: 'm1.i' })   // boundary remapped to member
    expect(find('e1').from).toEqual({ node: 'm1', pin: 'm1.o' }) // internal edge untouched
    expect(find('e2').from).toEqual({ node: 'm2', pin: 'm2.o' })
  })

  it('remaps a macro→macro edge on both ends', () => {
    const nodes = [
      node('a'), node('b'),
      macro('G', ['a'], [proxy({ macroPin: 'G.out', direction: 'out', memberNode: 'a', memberPin: 'a.o' })]),
      macro('P', ['b'], [proxy({ macroPin: 'P.in', direction: 'in', memberNode: 'b', memberPin: 'b.i' })]),
    ]
    const flat = flattenMacroProxies(nodes, [edge('e', 'G', 'G.out', 'P', 'P.in')])
    expect(flat.edges[0]!.from).toEqual({ node: 'a', pin: 'a.o' })
    expect(flat.edges[0]!.to).toEqual({ node: 'b', pin: 'b.i' })
  })

  it('recurses through a nested macro (member pin is an inner macro proxy pin)', () => {
    // Outer macro O whose member is inner macro I; O.in bridges I.inProxy, which bridges leaf.i.
    const nodes = [
      node('ext'), node('leaf'),
      macro('I', ['leaf'], [proxy({ macroPin: 'I.in', direction: 'in', memberNode: 'leaf', memberPin: 'leaf.i' })]),
      macro('O', ['I'], [proxy({ macroPin: 'O.in', direction: 'in', memberNode: 'I', memberPin: 'I.in' })]),
    ]
    const flat = flattenMacroProxies(nodes, [edge('e', 'ext', 'ext.o', 'O', 'O.in')])
    expect(flat.nodes.map((n) => n.id).sort()).toEqual(['ext', 'leaf'])
    expect(flat.edges[0]!.to).toEqual({ node: 'leaf', pin: 'leaf.i' }) // resolved through both macros
  })

  it('leaves a macro-free graph unchanged', () => {
    const nodes = [node('a'), node('b')]
    const edges = [edge('e', 'a', 'a.o', 'b', 'b.i')]
    const flat = flattenMacroProxies(nodes, edges)
    expect(flat.nodes).toHaveLength(2)
    expect(flat.edges[0]).toEqual({ id: 'e', from: { node: 'a', pin: 'a.o' }, to: { node: 'b', pin: 'b.i' } })
  })
})
