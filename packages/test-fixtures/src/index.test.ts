import { describe, it, expect } from 'vitest'
import { listFixtures, findFixture, loadFixture, MANIFEST } from './index.js'

describe('@xenolith/test-fixtures', () => {
  it('exposes the manifest as a non-empty list', () => {
    expect(MANIFEST.length).toBeGreaterThanOrEqual(5)
  })

  it('listFixtures() with no filter returns the full manifest', () => {
    expect(listFixtures()).toEqual(MANIFEST)
  })

  it('listFixtures({ format: "litegraph" }) returns only litegraph entries', () => {
    const result = listFixtures({ format: 'litegraph' })
    expect(result.length).toBeGreaterThan(0)
    expect(result.every((r) => r.format === 'litegraph')).toBe(true)
  })

  it('findFixture() returns undefined for an unknown id', () => {
    expect(findFixture('nope/missing')).toBeUndefined()
  })

  it('loadFixture() rejects for an unknown id', async () => {
    await expect(loadFixture('nope/missing')).rejects.toThrow(/Unknown fixture/)
  })

  it('loadFixture("litegraph/s-basic") returns a LiteGraph-shaped object', async () => {
    const data = (await loadFixture('litegraph/s-basic')) as {
      nodes: unknown[]
      last_node_id: number
    }
    expect(Array.isArray(data.nodes)).toBe(true)
    expect(data.nodes.length).toBeGreaterThan(0)
    expect(typeof data.last_node_id).toBe('number')
  })

  it('every fixture in the manifest is actually loadable', async () => {
    for (const record of MANIFEST) {
      const data = (await loadFixture(record.id)) as { nodes: unknown[] }
      expect(Array.isArray(data.nodes)).toBe(true)
      expect(data.nodes.length).toBe(record.nodes)
    }
  })
})
