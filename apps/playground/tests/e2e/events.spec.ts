import { test, expect } from '@playwright/test'

// The public events API (`editor.on(...)`) — interaction-fired events that the headless unit test
// in @xenolith/editor (events.test.ts) cannot cover.
test.describe('public events API', () => {
  test('fires node:click + selection:changed on a node click, node:moved on drag', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
    await page.evaluate(async () => { await document.fonts.ready })
    await page.waitForTimeout(400)

    // Subscribe before interacting; stash payloads on window.
    const target = await page.evaluate(() => {
      const ed = (window as any).__xenoEditor
      const w = window as any
      w.__ev = { click: [], selection: [], moved: [], viewport: 0, widget: [] }
      ed.on('node:click', (e: any) => w.__ev.click.push(e.nodeId))
      ed.on('selection:changed', (e: any) => w.__ev.selection.push(e.nodeIds.length))
      ed.on('node:moved', (e: any) => w.__ev.moved.push(e))
      ed.on('viewport:changed', () => { w.__ev.viewport++ })
      ed.on('widget:changed', (e: any) => w.__ev.widget.push(e))
      // First node's header screen position (avoid widget rows).
      const vp = ed.viewport
      const n = [...ed.graph.nodes()].find((x: any) => x.type !== '$reroute')
      return { id: String(n.id), x: vp.x + (n.position.x + 60) * vp.zoom, y: vp.y + (n.position.y + 10) * vp.zoom, zoom: vp.zoom }
    })

    // Click the node header.
    await page.mouse.click(target.x, target.y)
    await page.waitForTimeout(150)

    // Drag it by 80px.
    await page.mouse.move(target.x, target.y)
    await page.mouse.down()
    await page.mouse.move(target.x + 80, target.y + 40, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(200)

    // Wheel-zoom to fire viewport:changed.
    await page.mouse.move(target.x, target.y)
    await page.mouse.wheel(0, -120)
    await page.waitForTimeout(150)

    const ev = await page.evaluate(() => (window as any).__ev)
    expect(ev.click).toContain(target.id)
    expect(ev.selection.length).toBeGreaterThan(0)
    expect(ev.moved.length).toBeGreaterThan(0)
    expect(ev.moved[0].nodeId).toBe(target.id)
    expect(ev.viewport).toBeGreaterThan(0)
  })

  test('fires widget:changed via setWidgetValue and unsubscribe stops delivery', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('canvas')
    await page.waitForTimeout(400)

    const result = await page.evaluate(() => {
      const ed = (window as any).__xenoEditor
      const hits: any[] = []
      const off = ed.on('widget:changed', (e: any) => hits.push(e))
      // Find a node with a number/slider widget.
      let nodeId: string | null = null, widgetId: string | null = null
      for (const n of ed.graph.nodes()) {
        const w = (n.widgets ?? []).find((x: any) => x.type === 'slider' || x.type === 'number')
        if (w) { nodeId = n.id; widgetId = w.id; break }
      }
      if (!nodeId) return { ok: false }
      ed.setWidgetValue(nodeId, widgetId, 0.5)
      const afterFirst = hits.length
      off()
      ed.setWidgetValue(nodeId, widgetId, 0.7)
      return { ok: true, afterFirst, afterOff: hits.length, last: hits[0] }
    })

    expect(result.ok).toBe(true)
    expect(result.afterFirst).toBe(1)
    expect(result.afterOff).toBe(1) // unsubscribe stopped the second delivery
  })
})
