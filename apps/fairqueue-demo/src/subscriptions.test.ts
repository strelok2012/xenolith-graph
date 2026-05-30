import { describe, it, expect } from 'vitest'
import { subscriptionsFromWires, type SubEdge } from './subscriptions.js'

const goodieMap = new Map<string, string>([
  ['goodie:gift', 'gift'],
  ['goodie:coin', 'coin'],
  ['goodie:star', 'star'],
])

const wire = (fromNode: string, fromPin: string, toNode: string, toPin: string): SubEdge =>
  ({ from: { node: fromNode, pin: fromPin }, to: { node: toNode, pin: toPin } })

describe('subscriptionsFromWires', () => {
  it('returns one entry per agent — empty when no subscribe wires touch them', () => {
    const out = subscriptionsFromWires(['Ada', 'Boris'], [], goodieMap)
    expect(out.get('Ada')).toEqual([])
    expect(out.get('Boris')).toEqual([])
    expect(out.size).toBe(2)
  })

  it('reads Goodie.self → Agent.subscribe wires into per-agent goodie-type arrays', () => {
    const edges: SubEdge[] = [
      wire('goodie:gift', 'goodie:gift:self', 'Ada',   'extra:subscribe'),
      wire('goodie:coin', 'goodie:coin:self', 'Ada',   'extra:subscribe'),
      wire('goodie:coin', 'goodie:coin:self', 'Boris', 'extra:subscribe'),
    ]
    const out = subscriptionsFromWires(['Ada', 'Boris'], edges, goodieMap)
    expect(out.get('Ada')).toEqual(['gift', 'coin'])  // order = edge order
    expect(out.get('Boris')).toEqual(['coin'])
  })

  it('ignores wires that aren’t goodie-to-subscribe (other pins, other nodes)', () => {
    const edges: SubEdge[] = [
      wire('goodie:gift',   'goodie:gift:self', 'gAgents', 'gAgents:items'),     // goodie → gather (not an agent)
      wire('something-else','sel',              'Ada',     'extra:subscribe'),     // not a known goodie
      wire('goodie:gift',   'goodie:gift:self', 'Ada',     'Ada:priority'),      // wrong target pin
    ]
    const out = subscriptionsFromWires(['Ada'], edges, goodieMap)
    expect(out.get('Ada')).toEqual([])
  })

  it('deduplicates duplicate edges to the same (agent, goodie) pair', () => {
    const edges: SubEdge[] = [
      wire('goodie:gift', 'goodie:gift:self', 'Ada', 'extra:subscribe'),
      wire('goodie:gift', 'goodie:gift:self', 'Ada', 'extra:subscribe'), // dup
    ]
    expect(subscriptionsFromWires(['Ada'], edges, goodieMap).get('Ada')).toEqual(['gift'])
  })

  it('an agent never listed in agentIds is absent from the result', () => {
    const edges: SubEdge[] = [wire('goodie:gift', 'goodie:gift:self', 'Unknown', 'extra:subscribe')]
    const out = subscriptionsFromWires(['Ada'], edges, goodieMap)
    expect(out.has('Unknown')).toBe(false)
    expect(out.get('Ada')).toEqual([])
  })
})
