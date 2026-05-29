import { test, expect } from '@playwright/test'

// editor.expandTemplateInstance (P1.5): read-only flatten of a $templateInstance into its primitive
// subgraph + a boundary pin remap, for a host evaluator. Must NOT mutate the document.

const E = '__xenoEditor'

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)
}

test('expands the demo Backup instance to its primitive members + boundary remap', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const flat = e.expandTemplateInstance('backup')
    return {
      nodeCount: flat.nodes.length,
      types: flat.nodes.map((n: any) => n.type).sort(),
      freshIds: flat.nodes.every((n: any) => n.id !== 'bk_compress' && n.id !== 'bk_encrypt'),
      edgeCount: flat.edges.length,
      inputKeys: Object.keys(flat.boundary.inputs).sort(),
      outputKeys: Object.keys(flat.boundary.outputs).sort(),
      payloadFanout: flat.boundary.inputs['backup.payload']?.length,
      // document untouched: the instance still exists, the flattened primitives are NOT in the graph
      instanceStillThere: !!e.graph.getNode('backup'),
      primitivesNotInGraph: flat.nodes.every((n: any) => !e.graph.getNode(n.id)),
    }
  }, E)
  expect(r.nodeCount).toBe(2)                       // bk_compress + bk_encrypt (Step members)
  expect(r.types).toEqual(['Step', 'Step'])
  expect(r.freshIds).toBe(true)
  expect(r.edgeCount).toBe(1)                       // compress.out → encrypt.in (member→member)
  expect(r.inputKeys).toEqual(['backup.key', 'backup.payload'])
  expect(r.outputKeys).toEqual(['backup.archive', 'backup.size'])
  expect(r.payloadFanout).toBe(1)
  expect(r.instanceStillThere).toBe(true)
  expect(r.primitivesNotInGraph).toBe(true)
})

test('returns null for a non-instance node', async ({ page }) => {
  await ready(page)
  const isNull = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const plain = [...e.graph.nodes()].find((n: any) => n.type !== '$templateInstance')
    return e.expandTemplateInstance(plain.id) === null
  }, E)
  expect(isNull).toBe(true)
})
