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

// Regression catches the bug the user saw in image #21: members were data-hidden (n.state.members
// remap was right) but the VIEWS for cloned members were still visible — the paste path created
// views before #applyMacroVisibility could hide them, leaving exposed loose Merge / Sub nodes.
test('select-all + copy + paste hides member node VIEWS for the pasted collapsed macros', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)

  const r = await page.evaluate(async (key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const macros = () => [...e.graph.nodes()].filter((n: any) => n.type === 'Macro')
    const collapsedMacros = () => macros().filter((m: any) => m.state.collapsed)
    const allCollapsedMembers = () => {
      const s = new Set<string>()
      for (const m of collapsedMacros()) for (const id of (m.state.members ?? [])) s.add(String(id))
      return s
    }

    const before = {
      total: collapsedMacros().length,
      members: allCollapsedMembers().size,
    }
    // Sanity: the playground demo MUST seed at least one collapsed macro, otherwise the rest of
    // this test would be a no-op pretending to pass (the bug we keep shipping).
    if (before.total === 0) return { error: 'no collapsed macros in playground demo — test is moot' }

    // The dissolve bug only fires once virtualization + per-node freeze kick in (auto-threshold
    // is ~300 nodes). Inflate the graph past the threshold by paste-cycling FIRST, then do the
    // measured paste — otherwise we test a non-LOD path and ship the regression yet again.
    let cycle = 0
    while ([...e.graph.nodes()].length < 400 && cycle++ < 6) {
      e.selectAll(); e.copySelection(); e.paste({ dx: 2000 * cycle, dy: 0 })
      await new Promise((r) => queueMicrotask(() => r(null)))
    }
    // Force a zoom/pan so freezeOnNavigate themes actually bake sprites, AND let LOD settle.
    e.setZoom?.(0.8); e.setZoom?.(1.0)
    await new Promise((r) => setTimeout(r, 200))

    const beforePaste = {
      total: collapsedMacros().length,
      members: allCollapsedMembers().size,
      graph: [...e.graph.nodes()].length,
    }

    e.selectAll()
    e.copySelection()
    e.paste({ dx: 4000, dy: 4000 })
    await new Promise((r) => queueMicrotask(() => r(null)))
    await new Promise((r) => requestAnimationFrame(() => r(null)))
    // The dissolve regression bites once virtualization recycles a member-view: the live cull
    // creates the view (visible=true by default) and used to never re-apply macro visibility.
    // Pan so the cull actually runs — otherwise we'd silently ship the bug yet again.
    e.fitView?.({ padding: 32 })
    await new Promise((r) => setTimeout(r, 200))

    const after = {
      total: collapsedMacros().length,
      members: allCollapsedMembers().size,
    }
    // Walk the post-paste set of macros: every one must still be collapsed AND none of its
    // member nodes may be rendered visibly. `isNodeRendered === true` = view present and
    // not hidden = the dissolve bug. `false` (hidden) and `null` (virtualised) are both fine.
    const exposed: { macroId: string; member: string; type: string }[] = []
    for (const m of collapsedMacros()) {
      for (const mid of (m.state.members ?? [])) {
        if (e.isNodeRendered(mid) === true) {
          const n = e.graph.getNode(mid)
          exposed.push({ macroId: String(m.id), member: String(mid), type: n?.type ?? '?' })
        }
      }
    }
    return { before: beforePaste, after, exposedCount: exposed.length, sample: exposed.slice(0, 5) }
  }, E)

  expect(r.error).toBeUndefined()
  // Diagnostic: log what state we actually hit — if `before.graph` is below 300 the LOD/freeze
  // path never engaged and a green result is meaningless. If we hit thousands then the bug must
  // be reproduced HERE or `isNodeRendered` is lying about scene visibility.
  // eslint-disable-next-line no-console
  console.log('[copy-macro] state:', JSON.stringify(r, null, 2))
  expect(r.before!.graph).toBeGreaterThanOrEqual(300)
  expect(r.after!.total).toBe(r.before!.total * 2)
  expect(r.after!.members).toBe(r.before!.members * 2)
  // ZERO members of ANY collapsed macro (original or pasted) may be visibly rendered.
  expect(r.exposedCount, `exposed members: ${JSON.stringify(r.sample)}`).toBe(0)
})
