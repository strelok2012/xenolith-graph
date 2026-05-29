import { test, expect } from '@playwright/test'

// Convert between the two grouping mechanisms: a collapsed Group (Macro) ⇄ a reusable Template.
// Group → Template makes a one-off group reusable + diveable; Template → Group inlines a definition
// into an editable collapsed macro (drops the shared-definition link).

const E = '__xenoEditor'

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)
}

test('Template instance → Group (demo Backup)', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const macroId = e.convertTemplateInstanceToMacro('backup')
    const m = macroId ? e.graph.getNode(macroId) : null
    return {
      isMacro: m?.type === 'Macro',
      collapsed: m?.state.collapsed === true,
      backupGone: !e.graph.getNode('backup'),
      members: (m?.state.members ?? []).length,
      membersExist: (m?.state.members ?? []).every((id: any) => !!e.graph.getNode(id)),
    }
  }, E)
  expect(r.isMacro).toBe(true)
  expect(r.collapsed).toBe(true)
  expect(r.backupGone).toBe(true)
  expect(r.members).toBeGreaterThan(0)
  expect(r.membersExist).toBe(true)
})

test('Group → Template carries a NESTED macro into the definition (no orphan Sub)', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    // Gather contains a nested 'gather_sub' macro per the demo (macroInPlace builds one for every macro).
    const subId = 'gather_sub'
    const subBefore = !!e.graph.getNode(subId)
    const instId = e.convertMacroToTemplate('gather')
    const inst = instId ? e.graph.getNode(instId) : null
    // After convert: no loose 'gather_sub' node at the root, and the new definition contains a Macro node.
    const defId = inst?.state?.definitionId
    const def = defId ? e.definitions.get(defId) : null
    const defHasMacro = def ? def.nodes.some((n: any) => n.type === 'Macro') : false
    return {
      subBefore,
      isInstance: inst?.type === '$templateInstance',
      gatherGone: !e.graph.getNode('gather'),
      subOrphanAtRoot: !!e.graph.getNode(subId), // ANY loose sub left at the root → bug
      defHasMacro,                                // the nested macro lives inside the definition now
    }
  }, E)
  expect(r.subBefore).toBe(true)         // sanity: demo had a nested gather_sub
  expect(r.isInstance).toBe(true)
  expect(r.gatherGone).toBe(true)
  expect(r.subOrphanAtRoot).toBe(false)  // ← the original bug; with the fix the sub is inside the def
  expect(r.defHasMacro).toBe(true)       // …and the definition does contain a (collapsed) macro
})

test('Group → Template → Group round-trips a flat group', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    e.registry.register({ type: 'P', title: 'P', pins: [
      { kind: 'data', direction: 'in', type: 'float' }, { kind: 'data', direction: 'out', type: 'float' },
    ] })
    const a = e.insertNode('P', { x: -600, y: -600 })
    const b = e.insertNode('P', { x: -380, y: -600 })
    e.connect(e.graph.getNode(a.id), 1, e.graph.getNode(b.id), 0) // a.out → b.in (internal edge)
    const macroId = e.createMacroFromSelection([a.id, b.id], 'MyGroup')

    const defsBefore = e.definitions.size
    const instId = e.convertMacroToTemplate(macroId)            // Group → Template
    const inst = instId ? e.graph.getNode(instId) : null
    const afterToTemplate = {
      isInstance: inst?.type === '$templateInstance',
      macroGone: !e.graph.getNode(macroId),
      defsGrew: e.definitions.size === defsBefore + 1,
    }

    const backId = instId ? e.convertTemplateInstanceToMacro(instId) : null // Template → Group
    const back = backId ? e.graph.getNode(backId) : null
    return {
      ...afterToTemplate,
      backIsMacro: back?.type === 'Macro',
      backMembers: (back?.state.members ?? []).length,
      backMembersExist: (back?.state.members ?? []).every((id: any) => !!e.graph.getNode(id)),
    }
  }, E)
  expect(r.isInstance).toBe(true)       // group became a template instance
  expect(r.macroGone).toBe(true)
  expect(r.defsGrew).toBe(true)         // a new definition was registered
  expect(r.backIsMacro).toBe(true)      // instance converted back into a macro
  expect(r.backMembers).toBeGreaterThan(0)
  expect(r.backMembersExist).toBe(true)
})
