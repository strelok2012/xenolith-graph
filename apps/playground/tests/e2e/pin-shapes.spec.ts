import { test, expect } from '@playwright/test'

// Pin shapes: exec pins draw as arrows (Blueprint control flow), a registered TypeDescriptor.shape
// draws its shape (e.g. struct = diamond), data falls back to a circle. Verified in both themes.

const E = '__xenoEditor'

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)
}

async function setup(page: import('@playwright/test').Page) {
  return page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    e.types.register({ id: 'struct:Agent', color: '#9b59ff', shape: 'diamond' })
    e.registry.register({
      type: 'ShapeDemo', title: 'ShapeDemo',
      pins: [
        { kind: 'exec', direction: 'in', type: 'exec' },
        { kind: 'exec', direction: 'out', type: 'exec' },
        { kind: 'data', direction: 'in', type: 'struct:Agent', label: 'Agent' },
        { kind: 'data', direction: 'out', type: 'float', label: 'Value' },
      ],
    })
    const n = e.insertNode('ShapeDemo', { x: 0, y: 0 })
    const z = 4
    e.setViewport({ x: 240 - n.position.x * z, y: 150 - n.position.y * z, zoom: z })
    return n.id
  }, E)
}

test('exec arrows + diamond struct pins render in Xen and Liquid Glass', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await ready(page)
  await setup(page)
  await page.waitForTimeout(250)
  await page.locator('canvas').screenshot({ path: 'test-results/pin-shapes-xen.png' })

  await page.getByRole('button', { name: 'Liquid Glass' }).click()
  await page.waitForTimeout(400)
  await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const n = [...e.graph.nodes()].find((x: any) => x.type === 'ShapeDemo')
    const z = 4
    e.setViewport({ x: 240 - n.position.x * z, y: 150 - n.position.y * z, zoom: z })
  }, E)
  await page.waitForTimeout(400)
  await page.locator('canvas').screenshot({ path: 'test-results/pin-shapes-lg.png' })

  expect(errors).toEqual([])
})
