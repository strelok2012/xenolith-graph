import { describe, it, expect } from 'vitest'
import { parseXenolithGraph } from '@xenolith/editor'
import { importComfyWorkflow, comfyTypeToXen } from '@xenolith/demo/comfy'

const workflow = {
  nodes: [
    {
      id: 1,
      type: 'CheckpointLoader',
      pos: [100, 200],
      size: [260, 100],
      outputs: [
        { name: 'MODEL', type: 'MODEL', links: [5], slot_index: 0 },
        { name: 'CLIP',  type: 'CLIP',  links: [],  slot_index: 1 },
      ],
      widgets_values: ['sd_xl.safetensors'],
      properties: { 'Node name for S&R': 'CheckpointLoader' },
    },
    {
      id: 2,
      type: 'KSampler',
      pos: { '0': 480, '1': 220 },
      size: { '0': 260, '1': 200 },
      inputs: [
        { name: 'model', type: 'MODEL', link: 5 },
        { name: 'seed',  type: 'INT',   link: null },
      ],
      outputs: [{ name: 'LATENT', type: 'LATENT', links: [], slot_index: 0 }],
      widgets_values: [12345, 20, 8],
    },
  ],
  links: [[5, 1, 0, 2, 0, 'MODEL']],
}

describe('comfyTypeToXen', () => {
  it('maps known ComfyUI types into Xen palette types', () => {
    expect(comfyTypeToXen('MODEL')).toBe('object')
    expect(comfyTypeToXen('IMAGE')).toBe('object')
    expect(comfyTypeToXen('INT')).toBe('float')
    expect(comfyTypeToXen('FLOAT')).toBe('float')
    expect(comfyTypeToXen('STRING')).toBe('string')
    expect(comfyTypeToXen('*')).toBe('any')
  })
})

describe('importComfyWorkflow', () => {
  const { graph, schemas } = importComfyWorkflow(workflow)

  it('produces a valid xenolith.v1 graph (parses without throwing)', () => {
    expect(() => parseXenolithGraph(graph)).not.toThrow()
    expect(graph.version).toBe('xenolith.v1')
  })

  it('maps widgets_values to typed widgets with seeded state', () => {
    const loader = graph.nodes.find((n) => n.type === 'CheckpointLoader')!
    const sampler = graph.nodes.find((n) => n.type === 'KSampler')!
    // CheckpointLoader: ['sd_xl.safetensors'] → one text widget (generic positional label)
    expect(loader.widgets).toEqual([{ id: 'w0', type: 'text', label: 'param 1', key: 'w0', multiline: false }])
    expect(loader.state?.['w0']).toBe('sd_xl.safetensors')
    // KSampler: [12345, 20, 8] → three number widgets
    expect(sampler.widgets).toHaveLength(3)
    expect(sampler.widgets!.every((w) => w.type === 'number')).toBe(true)
    expect(sampler.state).toMatchObject({ w0: 12345, w1: 20, w2: 8 })
  })

  it('imports every node with mapped position (array and object pos forms)', () => {
    expect(graph.nodes).toHaveLength(2)
    const loader = graph.nodes.find((n) => n.type === 'CheckpointLoader')!
    const sampler = graph.nodes.find((n) => n.type === 'KSampler')!
    expect(loader.position).toEqual({ x: 100, y: 200 })
    expect(sampler.position).toEqual({ x: 480, y: 220 })
  })

  it('derives pins from inputs/outputs with mapped types and labels', () => {
    const loader = graph.nodes.find((n) => n.type === 'CheckpointLoader')!
    const outs = loader.pins.filter((p) => p.direction === 'out')
    expect(outs.map((p) => p.label)).toEqual(['MODEL', 'CLIP'])
    expect(outs[0]!.type).toBe('object') // MODEL → object
    const sampler = graph.nodes.find((n) => n.type === 'KSampler')!
    expect(sampler.pins.filter((p) => p.direction === 'in')).toHaveLength(2)
    expect(sampler.pins.find((p) => p.label === 'seed')!.type).toBe('float') // INT → float
  })

  it('preserves the raw ComfyUI payload in node.state.__comfy for faithful re-export', () => {
    const loader = graph.nodes.find((n) => n.type === 'CheckpointLoader')!
    const comfy = loader.state?.['__comfy'] as Record<string, unknown>
    expect(comfy).toBeDefined()
    expect(comfy['widgets_values']).toEqual(['sd_xl.safetensors'])
    expect(comfy['type']).toBe('CheckpointLoader')
  })

  it('wires links into edges referencing the right pins', () => {
    expect(graph.edges).toHaveLength(1)
    const e = graph.edges[0]!
    const loader = graph.nodes.find((n) => n.type === 'CheckpointLoader')!
    const sampler = graph.nodes.find((n) => n.type === 'KSampler')!
    expect(e.from.node).toBe(loader.id)
    expect(e.to.node).toBe(sampler.id)
    expect(e.from.pin).toBe(loader.pins.find((p) => p.label === 'MODEL')!.id)
    expect(e.to.pin).toBe(sampler.pins.find((p) => p.label === 'model')!.id)
    expect(e.opts?.sourceType).toBe('object')
  })

  it('emits one schema per distinct node type', () => {
    expect(schemas.map((s) => s.type).sort()).toEqual(['CheckpointLoader', 'KSampler'])
    const loaderSchema = schemas.find((s) => s.type === 'CheckpointLoader')!
    expect(loaderSchema.pins.filter((p) => p.direction === 'out')).toHaveLength(2)
  })

  it('skips links whose endpoints are missing', () => {
    const broken = { nodes: workflow.nodes, links: [[9, 1, 0, 99, 0, 'MODEL']] }
    expect(importComfyWorkflow(broken).graph.edges).toHaveLength(0)
  })

  it('throws on a non-workflow payload', () => {
    expect(() => importComfyWorkflow({ foo: 1 })).toThrow(/workflow/i)
  })
})

import { REROUTE_TYPE } from '@xenolith/core'

describe('importComfyWorkflow — Reroute mapping', () => {
  const wf = {
    nodes: [
      {
        id: 10, type: 'Reroute', pos: [0, 0], size: [75, 26],
        inputs:  [{ name: '', type: '*',     link: 1, slot_index: 0 }],
        outputs: [{ name: '', type: 'IMAGE', links: [2], slot_index: 0 }],
      },
    ],
    links: [],
  }

  it('maps a ComfyUI Reroute onto the core reroute type', () => {
    const { graph } = importComfyWorkflow(wf)
    const n = graph.nodes[0]!
    expect(n.type).toBe(REROUTE_TYPE)
    expect(n.pins).toHaveLength(2)
    expect(n.pins[0]!.direction).toBe('in')
    expect(n.pins[1]!.direction).toBe('out')
  })

  it('colours both reroute pins by the resolved output type', () => {
    const { graph } = importComfyWorkflow(wf)
    const n = graph.nodes[0]!
    // IMAGE → object in our type system; the bare '*' input adopts the same colour
    expect(n.pins[0]!.type).toBe('object')
    expect(n.pins[1]!.type).toBe('object')
  })

  it('does not emit a reroute schema into the insert palette set', () => {
    const { schemas } = importComfyWorkflow(wf)
    expect(schemas.some((s) => s.type === REROUTE_TYPE || s.type === 'Reroute')).toBe(false)
  })
})
