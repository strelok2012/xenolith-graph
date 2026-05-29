import { chromium } from '@playwright/test'
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1200, height: 600 } })
await p.goto('http://localhost:5182/?engine=merged', { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(4000)
await p.evaluate(() => {
  const ed = window.__fqEditor
  const n = ed.graph.getNode('warehouseOut')
  ed.setViewport({ x: -n.position.x + 600, y: -n.position.y + 280, zoom: 1.8 })
})
await p.waitForTimeout(500)
await p.screenshot({ path: '/tmp/out.png' })
const sv = await p.evaluate(() => window.__fqEditor.graph.getNode('warehouseOut').state)
console.log('STATE', JSON.stringify(sv))
await b.close()
