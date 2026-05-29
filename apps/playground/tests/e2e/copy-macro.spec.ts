import { test, expect } from '@playwright/test'

// Regression: Ctrl+A / Ctrl+C / Ctrl+V must NOT dissolve collapsed macros into loose member nodes.
// Select-all selects the macro wrapper (not its hidden members); copy carries the members; paste
// recreates a valid collapsed group (members remapped + hidden), not exposed loose nodes.

const E = '__xenoEditor'

test('select-all + copy + paste duplicates macros as collapsed groups (no dissolve)', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)

  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const macros = () => [...e.graph.nodes()].filter((n: any) => n.type === 'Macro').length
    const hiddenSet = () => {
      const h = new Set<string>()
      for (const n of e.graph.nodes()) {
        if (n.type === 'Macro' && n.state.collapsed) for (const m of (n.state.members ?? [])) h.add(String(m))
      }
      return h
    }
    const before = { macros: macros(), hidden: hiddenSet().size }

    e.selectAll()
    // Ctrl+A must not have selected any hidden macro member.
    const hs = hiddenSet()
    const selectedHidden = e.selection.ids().filter((id: any) => hs.has(String(id))).length

    e.copySelection()
    e.paste({ dx: 2000, dy: 2000 })

    // Every macro (incl. pasted) must reference members that exist in the graph.
    const allMembersExist = [...e.graph.nodes()]
      .filter((n: any) => n.type === 'Macro')
      .every((m: any) => (m.state.members ?? []).every((mid: any) => !!e.graph.getNode(mid)))

    return { before, after: { macros: macros(), hidden: hiddenSet().size }, selectedHidden, allMembersExist }
  }, E)

  expect(r.selectedHidden).toBe(0)                     // Ctrl+A grabbed wrappers, not hidden members
  expect(r.after.macros).toBe(r.before.macros * 2)     // macros duplicated as wrappers
  expect(r.after.hidden).toBe(r.before.hidden * 2)     // pasted macros own their OWN (hidden) members
  expect(r.allMembersExist).toBe(true)                 // remap is valid (no dangling member refs)
})
