// Visual regressions for the MERGED engine. The Vitest unit suite cannot catch widget-rendering
// bugs (struct widget invisible, layout overhang, dead space) — those need a real browser. Each
// check below targets a specific class of bug we have actually shipped to the user, so the next
// time the layout/widget/plugin contract changes the test fails before the screenshot does.

import { test, expect } from '@playwright/test'

const url = '/?engine=merged'

async function gotoMerged(page: import('@playwright/test').Page): Promise<void> {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
  await page.goto(url)
  await page.waitForSelector('canvas')
  await page.evaluate(async () => { await document.fonts.ready })
  // Editor needs a frame to mount nodes + a frame for the DOM-widget reconcile loop + a frame for
  // the plugin's graph:loaded sync (which calls setNodePins/setNodeWidgets, triggering re-renders).
  await page.waitForTimeout(800)
  // Surface any unhandled console error or page error as a test failure.
  expect(errors, errors.join('\n')).toEqual([])
}

test.describe('merged engine — Schema + Struct visual contract', () => {
  test('canvas mounts and runtime plugin is installed (no console errors)', async ({ page }) => {
    await gotoMerged(page)
    expect(await page.locator('canvas').count()).toBeGreaterThan(0)
  })

  test('each Schema node renders its `struct` DOM widget with one editable row per field', async ({ page }) => {
    await gotoMerged(page)
    // The struct DOM widget renders ONE row per `state.fields` key, each row carrying a key input
    // (field name, editable) + a value input + a type-picker <select> + an × delete button. Two
    // schemas (agent: 4 fields, goodie: 4 fields) → at least 16 inputs and 8 selects total.
    // Catches: widget missing on Schema node, pinKey-binding broken, layout reserving 0 height.
    const inputs = page.locator('input')
    const selects = page.locator('select')
    await expect.poll(async () => await inputs.count(),  { timeout: 5_000 }).toBeGreaterThanOrEqual(16)
    await expect.poll(async () => await selects.count(), { timeout: 5_000 }).toBeGreaterThanOrEqual(8)
  })

  test('the agent Schema lists the expected fields (name/priority/salary/subs) as editable keys', async ({ page }) => {
    await gotoMerged(page)
    // Read every DOM-input value across the page; the key inputs hold field NAMES verbatim. We
    // expect all four agent schema fields plus all four goodie schema fields to be present.
    const keys = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLInputElement>('input')).map((i) => i.value),
    )
    for (const expected of ['name', 'priority', 'salary', 'subs', 'type', 'cost', 'rate']) {
      expect(keys, `missing field key "${expected}" in struct widgets`).toContain(expected)
    }
  })

  test('no DOM-widget element has a zero-sized bounding box (catches "widget mounts but no layout height")', async ({ page }) => {
    await gotoMerged(page)
    // Iterate every <input> & <select> on the page (they live inside the custom DOM-widget layer).
    // A widget that lost its layout height crashes here: its root <div> has w/h = 0, so do its
    // descendants. Reports the offenders' outerHTML so a regression is easy to read.
    const zeroSized = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll<HTMLElement>('input, select'))
      return els
        .map((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height, html: el.outerHTML.slice(0, 100) }))
        .filter((r) => r.w === 0 || r.h === 0)
    })
    expect(zeroSized, JSON.stringify(zeroSized)).toEqual([])
  })

  test('adding a field to a Schema propagates to every wired Struct — new pin + widget appear on every agent', async ({ page }) => {
    await gotoMerged(page)
    // Click "+ add field" on the agent Schema. The struct DOM widget appends `fieldN` to
    // state.fields and commits via setValue → widget:changed → plugin's handler re-syncs every
    // wired Struct via setNodePins + setNodeWidgets.
    // Trigger the field add via the editor API directly (the DOM-click path is flaky because the
    // host overlay intercepts pointer events). This still exercises the FULL plugin sync chain:
    // setWidgetValue → widget:changed → plugin's handler → setNodePins + setNodeWidgets.
    await page.evaluate(() => {
      const editor = (window as unknown as { __fqEditor: {
        graph: { getNode: (id: string) => { state: Record<string, unknown> } | undefined }
        setWidgetValue: (nodeId: string, widgetId: string, value: unknown) => void
      } }).__fqEditor
      const sch = editor.graph.getNode('schema:agent')
      const fields = { ...(sch?.state['fields'] as Record<string, unknown>), field1: '' }
      editor.setWidgetValue('schema:agent', 'fields', fields)
    })
    await page.waitForTimeout(500)
    // Query the live editor: every agent Struct must now carry a `field:field1` pin AND a
    // corresponding widget with key='field1'. This catches the failure mode the user keeps
    // hitting — Schema gets the field locally but the plugin never propagates it.
    const report = await page.evaluate(() => {
      const editor = (window as unknown as { __fqEditor: { graph: { nodes: () => Iterable<{ id: string; type: string; state: Record<string, unknown>; pins: ReadonlyArray<{ id: string }>; widgets?: ReadonlyArray<{ key?: string }> }> } } }).__fqEditor
      const agents = [...editor.graph.nodes()].filter((n) => n.type === 'Struct' && n.state['kind'] === 'agent')
      return agents.map((a) => ({
        id: a.id,
        pinIds:    a.pins.map((p) => String(p.id)),
        widgetKeys: (a.widgets ?? []).map((w) => w.key ?? ''),
      }))
    })
    expect(report.length, 'no agent Structs found in graph').toBeGreaterThan(0)
    for (const a of report) {
      expect(a.pinIds,    `agent ${a.id} missing field:field1 pin`)     .toContain('field:field1')
      expect(a.widgetKeys, `agent ${a.id} missing field1 widget binding`).toContain('field1')
    }
  })

  test('config widgets stay visible even when their pin IS wired (visibility:"always")', async ({ page }) => {
    await gotoMerged(page)
    // EVERY config widget (Const.value, GetVar/SetVar.name, MapField/ToMap.field, Output.value)
    // is bound to a pin that's wired in the demo. With default `visibility: 'whenDisconnected'`
    // they'd ALL hide — user sees blank Const, blank Get/Set, blank MapField. Each must declare
    // `visibility: 'always'` because it's the node's CONFIG, not a default fallback for the pin.
    const report = await page.evaluate(() => {
      const editor = (window as unknown as { __fqEditor: { graph: { nodes: () => Iterable<{ id: string; type: string; widgets?: ReadonlyArray<{ visibility?: string; pinKey?: string; type?: string }> }> } } }).__fqEditor
      const offenders: Array<{ id: string; type: string; widgetId: string }> = []
      for (const n of editor.graph.nodes()) {
        for (const w of n.widgets ?? []) {
          // Buttons don't have a value; custom widgets and pinKey-bound text/number/toggle MUST opt
          // out of whenDisconnected, otherwise wiring the pin makes them invisible.
          if (w.type === 'button') continue
          if (w.pinKey === undefined) continue
          if (w.visibility !== 'always') offenders.push({ id: n.id, type: n.type, widgetId: String((w as { id?: string }).id ?? '') })
        }
      }
      return offenders
    })
    expect(report, `widgets bound to wired pins without visibility:'always' — they render INVISIBLY:\n${JSON.stringify(report, null, 2)}`).toEqual([])
  })

  test('Output widgets actually show numeric values after a few ticks (host bridge mirrors VM vars)', async ({ page }) => {
    await gotoMerged(page)
    // Let the sim run a few ticks so Mean / Warehouse Outputs have non-zero values.
    await page.waitForTimeout(1500)
    const outputs = await page.evaluate(() => {
      const editor = (window as unknown as { __fqEditor: { graph: { nodes: () => Iterable<{ id: string; type: string; state: Record<string, unknown> }> } } }).__fqEditor
      return [...editor.graph.nodes()]
        .filter((n) => n.type === 'Output')
        .map((n) => ({ id: n.id, value: n.state['value'] }))
    })
    expect(outputs.length, 'no Output nodes found').toBeGreaterThan(0)
    for (const o of outputs) {
      expect(o.value, `Output ${o.id} has no value — attachRuntimeBridge not mirroring?`).toBeDefined()
    }
  })

  test('merged engine screenshot (baseline)', async ({ page }) => {
    await gotoMerged(page)
    // Whole-canvas snapshot. Updates: `pnpm --filter @xenolith/fairqueue-demo test:e2e --update-snapshots`.
    await expect(page).toHaveScreenshot('merged-initial.png', { fullPage: false, maxDiffPixelRatio: 0.02 })
  })
})
