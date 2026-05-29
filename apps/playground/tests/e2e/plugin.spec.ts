import { test, expect } from '@playwright/test'

// Plugin host (P0.1): editor.use(plugin) runs install immediately with a stable PluginContext over
// the editor's public surface; a returned disposer runs on editor.destroy(); duplicate names throw.

const E = '__xenoEditor'

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window && '__XenolithEditor' in window)
}

test('use() installs a plugin with a working context wired to the editor', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const seen: Record<string, unknown> = {}
    e.use({
      name: 'probe',
      install(ctx: any) {
        seen.hasRegistry = typeof ctx.registry?.register === 'function'
        seen.hasTypes = typeof ctx.types?.register === 'function'
        seen.hasApp = !!ctx.app
        seen.graphIsEditorGraph = ctx.graph === e.graph
        seen.busIsEditorBus = ctx.commandBus === e.commandBus
        ctx.types.register({ id: 'struct:Agent', color: '#9b59ff' })
        ctx.registry.register({ type: 'PluginNode', title: 'PluginNode', pins: [] })
        seen.onReturnsUnsub = typeof ctx.on('node:added', () => {}) === 'function'
      },
    })
    return {
      ...seen,
      typeRegistered: e.types.has('struct:Agent'),
      schemaRegistered: e.registry.has('PluginNode'),
    }
  }, E)
  expect(r.hasRegistry).toBe(true)
  expect(r.hasTypes).toBe(true)
  expect(r.hasApp).toBe(true)
  expect(r.graphIsEditorGraph).toBe(true)
  expect(r.busIsEditorBus).toBe(true)
  expect(r.onReturnsUnsub).toBe(true)
  expect(r.typeRegistered).toBe(true)   // ctx.registry/types mutate the real editor registries
  expect(r.schemaRegistered).toBe(true)
})

test('installing two plugins with the same name throws', async ({ page }) => {
  await ready(page)
  const threw = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    e.use({ name: 'dup', install() {} })
    try {
      e.use({ name: 'dup', install() {} })
      return false
    } catch {
      return true
    }
  }, E)
  expect(threw).toBe(true)
})

test('a plugin disposer runs on editor.destroy()', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate(async () => {
    const Ctor = (window as unknown as Record<string, any>).__XenolithEditor
    const div = document.createElement('div')
    div.style.cssText = 'position:absolute;left:-9999px;width:200px;height:200px'
    document.body.appendChild(div)
    const ed = await Ctor.init(div, { resizeToWindow: false, minimap: false })
    const w = window as unknown as Record<string, boolean>
    w.__pluginDisposed = false
    ed.use({ name: 'd', install: () => () => { w.__pluginDisposed = true } })
    const before = w.__pluginDisposed
    ed.destroy()
    div.remove()
    return { before, after: w.__pluginDisposed }
  })
  expect(r.before).toBe(false)
  expect(r.after).toBe(true)
})
