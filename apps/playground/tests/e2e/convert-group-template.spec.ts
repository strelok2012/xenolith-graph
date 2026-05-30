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

test('Group → Template: interface mirrors the macro proxy pins exactly (no phantom In/Out from nested-macro hidden members)', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const gather = e.graph.getNode('gather')
    const macroIns  = (gather?.pins ?? []).filter((p: any) => p.direction === 'in')
    const macroOuts = (gather?.pins ?? []).filter((p: any) => p.direction === 'out')
    const instId = e.convertMacroToTemplate('gather')
    const inst = instId ? e.graph.getNode(instId) : null
    const inPins  = (inst?.pins ?? []).filter((p: any) => p.direction === 'in').map((p: any) => p.label ?? '')
    const outPins = (inst?.pins ?? []).filter((p: any) => p.direction === 'out').map((p: any) => p.label ?? '')
    return { gatherInCount: macroIns.length, gatherOutCount: macroOuts.length, inPins, outPins }
  }, E)
  // Gather's proxy interface was A/B/C in + Out — the template instance must match it 1:1.
  expect(r.gatherInCount).toBe(3)
  expect(r.gatherOutCount).toBe(1)
  expect(r.inPins.length).toBe(3)
  expect(r.outPins.length).toBe(1)
  expect(r.inPins.sort()).toEqual(['A', 'B', 'C'])
  expect(r.outPins).toEqual(['Out'])
})

test('Group → Template: Ctrl+Z restores the original collapsed macro atomically (no half-state)', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    // Snapshot the pre-convert state of Gather: node existence + collapse + its proxy interface.
    const before = (() => {
      const g = e.graph.getNode('gather')
      return {
        exists: !!g,
        collapsed: g?.state?.collapsed === true,
        type: g?.type,
        inPins:  (g?.pins ?? []).filter((p: any) => p.direction === 'in').map((p: any) => p.label ?? '').sort(),
        outPins: (g?.pins ?? []).filter((p: any) => p.direction === 'out').map((p: any) => p.label ?? '').sort(),
        // Sample members that ought to be hidden inside Gather, not loose at the root.
        memberCount: (g?.state?.members ?? []).length,
      }
    })()
    const instId = e.convertMacroToTemplate('gather')
    const mid = {
      gone: !e.graph.getNode('gather'),
      instExists: !!instId && !!e.graph.getNode(instId),
      orphanMembers: ['gather_in0','gather_in1','gather_in2','gather_m1','gather_m2','gather_sub','gather_out']
        .filter((id) => !!e.graph.getNode(id)).length,
    }
    // ONE undo must reverse the WHOLE conversion (not leave the macro half-dissolved).
    e.commandBus.undo()
    const after = (() => {
      const g = e.graph.getNode('gather')
      return {
        exists: !!g,
        collapsed: g?.state?.collapsed === true,
        type: g?.type,
        inPins:  (g?.pins ?? []).filter((p: any) => p.direction === 'in').map((p: any) => p.label ?? '').sort(),
        outPins: (g?.pins ?? []).filter((p: any) => p.direction === 'out').map((p: any) => p.label ?? '').sort(),
        memberCount: (g?.state?.members ?? []).length,
        instGone: !!instId && !e.graph.getNode(instId),
        // No template members should remain at the root after undo — they belong inside the macro.
        looseMembers: ['gather_in0','gather_in1','gather_in2','gather_m1','gather_m2','gather_sub','gather_out']
          .filter((id) => {
            const n = e.graph.getNode(id); if (!n) return false
            // True "loose" means it's not hidden as a member of any macro at the root.
            for (const cand of e.graph.nodes()) {
              if (cand.type === 'Macro' && (cand.state?.members ?? []).includes(id)) return false
            }
            return true
          }).length,
      }
    })()
    return { before, mid, after }
  }, E)
  // Sanity: Gather was a real collapsed macro before, became a template instance mid-way.
  expect(r.before.exists).toBe(true)
  expect(r.before.collapsed).toBe(true)
  expect(r.before.type).toBe('Macro')
  expect(r.mid.gone).toBe(true)
  expect(r.mid.instExists).toBe(true)
  expect(r.mid.orphanMembers).toBe(0)            // members lived inside the new definition, not at the root
  // The crux: one Ctrl+Z fully restores Gather — node back, collapsed, same interface, no debris.
  expect(r.after.exists).toBe(true)
  expect(r.after.type).toBe('Macro')
  expect(r.after.collapsed).toBe(true)
  expect(r.after.inPins).toEqual(r.before.inPins)
  expect(r.after.outPins).toEqual(r.before.outPins)
  expect(r.after.memberCount).toBe(r.before.memberCount)
  expect(r.after.instGone).toBe(true)            // the template instance the conversion created is gone
  expect(r.after.looseMembers).toBe(0)           // none of Gather's members floating loose at the root
})

test('Template → Group: Ctrl+Z restores the original template instance atomically', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const before = (() => {
      const t = e.graph.getNode('backup')
      return {
        exists: !!t,
        type: t?.type,
        defId: t?.state?.definitionId,
        inPins:  (t?.pins ?? []).filter((p: any) => p.direction === 'in').map((p: any) => p.label ?? '').sort(),
        outPins: (t?.pins ?? []).filter((p: any) => p.direction === 'out').map((p: any) => p.label ?? '').sort(),
      }
    })()
    const macroId = e.convertTemplateInstanceToMacro('backup')
    e.commandBus.undo()
    const after = (() => {
      const t = e.graph.getNode('backup')
      return {
        exists: !!t,
        type: t?.type,
        defId: t?.state?.definitionId,
        inPins:  (t?.pins ?? []).filter((p: any) => p.direction === 'in').map((p: any) => p.label ?? '').sort(),
        outPins: (t?.pins ?? []).filter((p: any) => p.direction === 'out').map((p: any) => p.label ?? '').sort(),
        macroGone: !!macroId && !e.graph.getNode(macroId),
      }
    })()
    return { before, after }
  }, E)
  expect(r.before.exists).toBe(true)
  expect(r.before.type).toBe('$templateInstance')
  expect(r.after.exists).toBe(true)
  expect(r.after.type).toBe('$templateInstance')  // not a Macro — undo restored the instance
  expect(r.after.defId).toBe(r.before.defId)      // same definition link
  expect(r.after.inPins).toEqual(r.before.inPins)
  expect(r.after.outPins).toEqual(r.before.outPins)
  expect(r.after.macroGone).toBe(true)             // the macro the conversion created is gone
})

test('Group → Template preserves pin label ORDER (A, B, C — never reversed by the walk)', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const macroIns  = (e.graph.getNode('gather')?.pins ?? []).filter((p: any) => p.direction === 'in').map((p: any) => p.label ?? '')
    const macroOuts = (e.graph.getNode('gather')?.pins ?? []).filter((p: any) => p.direction === 'out').map((p: any) => p.label ?? '')
    const instId = e.convertMacroToTemplate('gather')
    const inst = instId ? e.graph.getNode(instId) : null
    const inLabels  = (inst?.pins ?? []).filter((p: any) => p.direction === 'in').map((p: any) => p.label ?? '')
    const outLabels = (inst?.pins ?? []).filter((p: any) => p.direction === 'out').map((p: any) => p.label ?? '')
    return { macroIns, macroOuts, inLabels, outLabels }
  }, E)
  expect(r.macroIns).toEqual(['A', 'B', 'C'])      // sanity — the macro had A/B/C top→bottom
  expect(r.macroOuts).toEqual(['Out'])
  // The template instance inherits the SAME order — A first, then B, then C. A stack-pop walk used
  // to reverse this to C/B/A.
  expect(r.inLabels).toEqual(['A', 'B', 'C'])
  expect(r.outLabels).toEqual(['Out'])
})

test('Group ⇄ Template cycle 3× keeps pins identical (no phantom In/Out from stale nested-macro state)', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const snap = (n: any) => ({
      type: n?.type,
      inPins:  (n?.pins ?? []).filter((p: any) => p.direction === 'in').map((p: any) => p.label ?? ''),
      outPins: (n?.pins ?? []).filter((p: any) => p.direction === 'out').map((p: any) => p.label ?? ''),
    })
    const trail: any[] = []
    trail.push({ step: 'initial macro Gather', ...snap(e.graph.getNode('gather')) })
    let currentId: string = 'gather'
    // Three full cycles: Group → Template → Group → … (instance ↔ macro). Each step should leave
    // the interface (label set + ORDER) exactly the same — phantom pins or reordering means the
    // remap of nested-macro state didn't carry through.
    for (let i = 0; i < 3; i++) {
      const tId = e.convertMacroToTemplate(currentId)
      if (!tId) throw new Error(`macro→template failed at cycle ${i}`)
      trail.push({ step: `cycle ${i} → template`, ...snap(e.graph.getNode(tId)) })
      const mId = e.convertTemplateInstanceToMacro(tId)
      if (!mId) throw new Error(`template→macro failed at cycle ${i}`)
      trail.push({ step: `cycle ${i} → macro`,    ...snap(e.graph.getNode(mId)) })
      currentId = mId
    }
    return trail
  }, E)
  // Every snapshot must match the initial interface exactly.
  const expectedIns  = ['A', 'B', 'C']
  const expectedOuts = ['Out']
  for (const s of r) {
    expect(s.inPins,  `${s.step}: in pin labels`).toEqual(expectedIns)
    expect(s.outPins, `${s.step}: out pin labels`).toEqual(expectedOuts)
  }
})

test('Template → Group: top-level selection excludes nested-macro members (no double-membership)', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    // Make the demo Gather a template first so we have an instance to convert back. Its definition
    // contains a nested 'Sub' macro with two hidden members (sa, sb).
    const tId = e.convertMacroToTemplate('gather')
    if (!tId) throw new Error('macro→template failed')
    const mId = e.convertTemplateInstanceToMacro(tId)
    if (!mId) throw new Error('template→macro failed')
    const outer = e.graph.getNode(mId)
    const outerMembers: string[] = (outer?.state?.members ?? []).map(String)
    // Find the nested Sub macro inside the outer one — it's the member whose own type is 'Macro'.
    const subId = outerMembers.find((id) => e.graph.getNode(id)?.type === 'Macro')
    const sub = subId ? e.graph.getNode(subId) : null
    const subMembers: string[] = (sub?.state?.members ?? []).map(String)
    // Bug: outer.state.members contained Sub's hidden members flat (double-listed). Fix: they're
    // ONLY in Sub.state.members, not in outer.state.members.
    const overlap = subMembers.filter((id) => outerMembers.includes(id))
    return {
      outerHasSub: !!subId,
      subHasMembers: subMembers.length > 0,
      overlap,
      // Each sub-member still exists as a real node in the graph (not orphaned).
      subMembersExist: subMembers.every((id) => !!e.graph.getNode(id)),
    }
  }, E)
  expect(r.outerHasSub).toBe(true)
  expect(r.subHasMembers).toBe(true)
  expect(r.subMembersExist).toBe(true)
  expect(r.overlap).toEqual([])     // ← the regression: no double-membership
})

test('Template → Group: ungrouping the new outer Macro restores the Sub nested macro intact', async ({ page }) => {
  await ready(page)
  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const tId = e.convertMacroToTemplate('gather')
    const mId = e.convertTemplateInstanceToMacro(tId)
    // Ungroup the new outer macro — its members spill out, including the nested Sub macro.
    const outer = e.graph.getNode(mId)
    const outerMembers: string[] = (outer?.state?.members ?? []).map(String)
    const subId = outerMembers.find((id) => e.graph.getNode(id)?.type === 'Macro')
    e.ungroupMacro(mId)
    const subStillThere = !!(subId && e.graph.getNode(subId))
    // The Sub macro must STILL be a collapsed macro with intact proxy pins and members — i.e. the
    // unpack→re-collapse round-trip preserved its state.proxyMap/members remap.
    const sub = subId ? e.graph.getNode(subId) : null
    const subMembers: string[] = (sub?.state?.members ?? []).map(String)
    const subMembersExistAndAreNotOuter = subMembers.length > 0 && subMembers.every((id) => {
      const n = e.graph.getNode(id); return !!n && n.type !== 'Macro'
    })
    // Now ungroup Sub — that exercises ungroupMacro on the inlined nested macro, which depends on
    // state.proxyMap being remapped (macroPin/memberNode/memberPin pointing to the NEW ids).
    const beforeEdges = [...e.graph.edges()].length
    const ok = subId ? e.ungroupMacro(subId) : false
    const afterEdges = [...e.graph.edges()].length
    const subGone = !!(subId && !e.graph.getNode(subId))
    // After Sub is ungrouped, its members (sa, sb) must remain wired — count of edges should not
    // collapse to zero (a broken proxyMap remap silently dropped the bridge edges).
    return { subStillThere, subMembers: subMembers.length, subMembersExistAndAreNotOuter, ok, beforeEdges, afterEdges, subGone }
  }, E)
  expect(r.subStillThere).toBe(true)
  expect(r.subMembers).toBeGreaterThan(0)
  expect(r.subMembersExistAndAreNotOuter).toBe(true)
  expect(r.ok).toBe(true)
  expect(r.subGone).toBe(true)
  expect(r.afterEdges).toBeGreaterThanOrEqual(r.beforeEdges - 0) // edges preserved or grew (bridge rewired)
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
