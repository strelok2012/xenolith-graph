import { test, expect } from '@playwright/test'

// Regression: a template's interface boundary nodes ($templateInput / $templateOutput) must NEVER be
// pulled into a new Template or Macro. Selecting them + a real node templates/groups only the real
// node; selecting only boundaries is a no-op. Boundaries define the interface — grouping them away
// would silently destroy the template's in/out pins.

const E = '__xenoEditor'

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)
}

test('Convert to Template skips boundary nodes, templating only the real member', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    e.diveInto('backup') // inside backup_def: bk_payload/bk_key = inputs, bk_archive/bk_size = outputs
    const instanceId = e.createTemplateFromSelection(['bk_payload', 'bk_compress'])
    return {
      created: instanceId !== null,
      boundaryKept: !!e.graph.getNode('bk_payload') && e.graph.getNode('bk_payload').type === '$templateInput',
      memberTemplated: !e.graph.getNode('bk_compress'), // moved into the new nested definition
    }
  }, E)
  expect(r.created).toBe(true)
  expect(r.boundaryKept).toBe(true)   // the input boundary stays in the definition
  expect(r.memberTemplated).toBe(true)
})

test('Convert to Template with only boundaries selected is a no-op', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    e.diveInto('backup')
    const result = e.createTemplateFromSelection(['bk_payload', 'bk_key'])
    return {
      result,
      bothKept: !!e.graph.getNode('bk_payload') && !!e.graph.getNode('bk_key'),
    }
  }, E)
  expect(r.result).toBeNull()
  expect(r.bothKept).toBe(true)
})

test('Group skips boundary nodes', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    e.diveInto('backup')
    const onlyBoundaries = e.createMacroFromSelection(['bk_archive', 'bk_size'])
    const mixed = e.createMacroFromSelection(['bk_archive', 'bk_encrypt'])
    const macro = mixed ? e.graph.getNode(mixed) : null
    const members: string[] = macro ? (macro.state.members ?? macro.state.macroMembers ?? []) : []
    return {
      onlyBoundaries,
      mixedCreated: mixed !== null,
      archiveStillBoundary: !!e.graph.getNode('bk_archive') && e.graph.getNode('bk_archive').type === '$templateOutput',
      macroHasNoBoundary: !members.includes('bk_archive'),
    }
  }, E)
  expect(r.onlyBoundaries).toBeNull()        // selecting only boundaries → no macro
  expect(r.archiveStillBoundary).toBe(true)  // the output boundary survives untouched
  expect(r.macroHasNoBoundary).toBe(true)
})
