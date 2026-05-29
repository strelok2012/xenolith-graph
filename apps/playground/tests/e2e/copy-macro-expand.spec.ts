import { test, expect } from '@playwright/test'

// Regression: copying a single collapsed macro then EXPANDING the copy must not wire its members
// to the ORIGINAL external nodes. Before the fix, the cloned `state.proxyMap` kept the original
// externalNode ids (the external wasn't in the clipboard), and #setMacroCollapsed on expand happily
// created fresh edges from those ORIGINAL externals to the new cloned members.

const E = '__xenoEditor'

test('copy + expand of a lone collapsed macro creates no cross old-new edges', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.waitForFunction(() => '__xenoEditor' in window)

  const r = await page.evaluate((key) => {
    const e = (window as unknown as Record<string, any>)[key]
    const beforeNodeIds = new Set([...e.graph.nodes()].map((n: any) => String(n.id)))
    const beforeEdgeCount = [...e.graph.edges()].length

    // Single-select the lone collapsed Gather (no externals in the selection).
    e.selection.replaceWith(['gather'])
    e.copySelection()
    e.paste({ dx: 800, dy: 0 }) // big offset so the new graph is far from the original

    // Count proxyMap entries across ALL new macros that still reference ORIGINAL externals
    // (any entry pointing at a node that existed before paste = a stale pointer).
    const newMacros = [...e.graph.nodes()].filter((n: any) =>
      n.type === 'Macro' && !beforeNodeIds.has(String(n.id))
    )
    const staleExternals = newMacros.reduce((sum: number, m: any) => {
      const pm = (m.state.proxyMap ?? []) as any[]
      return sum + pm.filter((r) => beforeNodeIds.has(String(r.externalNode))).length
    }, 0)

    // The outer cloned macro = the one whose members include other new macros (nested), OR pick the
    // largest. For the demo's Gather, the outer has the most members; find it.
    const newGather = newMacros
      .filter((m: any) => !newMacros.some((other: any) => (other.state.members ?? []).includes(m.id)))
      .sort((a: any, b: any) => (b.state.members?.length ?? 0) - (a.state.members?.length ?? 0))[0]
    e.expandMacro(newGather.id) // expand the OUTER cloned macro

    // After expand: no edge may bridge an OLD node (existed before paste) to a NEW node (cloned).
    const cross = [...e.graph.edges()].filter((ed: any) => {
      const fromOld = beforeNodeIds.has(String(ed.from.node))
      const toOld = beforeNodeIds.has(String(ed.to.node))
      return (fromOld && !toOld) || (!fromOld && toOld)
    }).length

    // Also: no original-graph edge was added (the original's edge count is unchanged).
    const afterEdgeCount = [...e.graph.edges()].length
    const oldEdgesUntouched = [...e.graph.edges()]
      .filter((ed: any) => beforeNodeIds.has(String(ed.from.node)) && beforeNodeIds.has(String(ed.to.node))).length

    return {
      staleExternals,         // 0 with the fix: every proxyMap entry points at a CLONED external
      crossEdges: cross,      // 0 with the fix
      beforeEdgeCount,
      afterEdgeCount,
      oldEdgesUntouched,
    }
  }, E)

  expect(r.staleExternals).toBe(0)                    // no proxyMap entry still references an original external
  expect(r.crossEdges).toBe(0)                        // expand didn't wire copy ↔ original
  expect(r.oldEdgesUntouched).toBeGreaterThan(0)
})
