import { test, expect, type Page } from '@playwright/test'
import { captureCanvas, countPixelsNear, RING_OK } from './_helpers.js'

// E2E for the visual stepping debugger. Drives the SPA page via window.__xenoDebug — the
// in-memory handle exposed by StepDebuggerDemo. We assert the planned WALK ORDER for both
// collapsed and expanded macro states, then exercise step-by-step trace + status side effects
// (current/executed) so visual ghosts on collapse are caught here, not by hand.

interface DebugHandle {
  order: string[]
  status: string
  history: Array<{ type: string; outputs: Record<string, unknown> }>
  nodeStatuses: Record<string, string>
  currentType: string | null
}

async function ready(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForSelector('canvas')
  await page.getByRole('button', { name: '9 · Step debugger' }).click()
  await page.waitForFunction(() => (window as unknown as { __xenoDebug?: unknown }).__xenoDebug !== undefined)
  await page.waitForTimeout(200)
}

async function snap(page: Page): Promise<DebugHandle> {
  return await page.evaluate(() => {
    type W = { __xenoDebug: { editor: { graph: { nodes(): Iterable<{ id: string; type: string }>; getNode(id: string): { type: string; state: Record<string, unknown> } | undefined }; setNodeStatus(id: string, s: string): void }; debugger: { order: string[]; status: string; history: ReadonlyArray<{ type: string; outputs: Map<string, unknown> }> }; macroId: string } }
    const d = (window as unknown as W).__xenoDebug
    const editor = d.editor
    const dbg = d.debugger
    // Read per-node status by peeking into editor — there's no public getter, so we rely on
    // setNodeStatus being mirrored via the renderer's node-view state. For now, infer status
    // from a backing store: extend the demo to mirror nodeStatus on a window map.
    const statuses = (window as unknown as { __xenoNodeStatus?: Record<string, string> }).__xenoNodeStatus ?? {}
    const curId = (dbg as unknown as { currentNodeId: string | null }).currentNodeId
    return {
      order: dbg.order.map((id) => editor.graph.getNode(id)?.type ?? '?'),
      status: dbg.status,
      history: dbg.history.map((r) => ({ type: r.type, outputs: Object.fromEntries(r.outputs) })),
      nodeStatuses: { ...statuses },
      currentType: curId ? (editor.graph.getNode(curId)?.type ?? null) : null,
    }
  })
}

async function start(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^▶ Start$/ }).click()
  await page.waitForTimeout(150)
}
async function step(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^⤵ Step$/ }).click()
  await page.waitForTimeout(80)
}
async function cont(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^⏩ Continue$/ }).click()
  await page.waitForTimeout(200)
}
async function stop(page: Page): Promise<void> {
  await page.getByRole('button', { name: /^■ Stop$/ }).click()
  await page.waitForTimeout(80)
}
async function toggleMacro(page: Page): Promise<void> {
  await page.getByRole('button', { name: /(Expand|Collapse) macro/ }).click()
  await page.waitForTimeout(350)
}

test('collapsed: order = [Const, Const, Const, Macro, Template, Display]', async ({ page }) => {
  await ready(page)
  await start(page)
  const s = await snap(page)
  // No member nodes (Add/Multiply/Identity) when both wrappings are collapsed.
  expect(s.order).not.toContain('Add')
  expect(s.order).not.toContain('Multiply')
  expect(s.order).not.toContain('Identity')
  const types = s.order
  expect(types.filter((t) => t === 'Const')).toHaveLength(3)
  const macroIdx = types.indexOf('Macro')
  const tplIdx = types.indexOf('$templateInstance')
  const dispIdx = types.indexOf('Display')
  // Pipeline: Const → Macro → Template → Display.
  expect(macroIdx).toBeGreaterThan(2)
  expect(tplIdx).toBeGreaterThan(macroIdx)
  expect(dispIdx).toBeGreaterThan(tplIdx)
})

test('continue() walks the collapsed graph end-to-end without skipping Macro or Template', async ({ page }) => {
  await ready(page)
  await start(page)
  await cont(page)
  await page.waitForTimeout(300)
  const s = await snap(page)
  expect(s.status).toBe('finished')
  const traceTypes = s.history.map((r) => r.type)
  expect(traceTypes).toContain('Macro')
  expect(traceTypes).toContain('$templateInstance')
  // Macro must execute BEFORE the Display it feeds.
  const macroIdx = traceTypes.indexOf('Macro')
  const lastDisplay = traceTypes.lastIndexOf('Display')
  expect(macroIdx).toBeLessThan(lastDisplay)
})

test('expanded: members are steps; macro itself is SKIPPED (visual frame, no IO)', async ({ page }) => {
  await ready(page)
  await toggleMacro(page)
  await start(page)
  const s = await snap(page)
  const types = s.order
  expect(types).toContain('Add')
  expect(types).toContain('Multiply')
  expect(types).toContain('$templateInstance')
  expect(types).toContain('Display')
  // Macro is NOT a step when expanded — data flows member → external directly through the now-
  // direct edge (Multiply → Template), with no pause on the empty macro frame in between.
  expect(types).not.toContain('Macro')
  const addIdx  = types.indexOf('Add')
  const mulIdx  = types.indexOf('Multiply')
  const tplIdx  = types.indexOf('$templateInstance')
  const dispIdx = types.indexOf('Display')
  expect(addIdx).toBeLessThan(mulIdx)
  expect(mulIdx).toBeLessThan(tplIdx)
  expect(tplIdx).toBeLessThan(dispIdx)
})

test('expanded continue() executes members in topological order, no macro step', async ({ page }) => {
  await ready(page)
  await toggleMacro(page)
  await start(page)
  await cont(page)
  await page.waitForTimeout(300)
  const s = await snap(page)
  expect(s.status).toBe('finished')
  const traceTypes = s.history.map((r) => r.type)
  expect(traceTypes).not.toContain('Macro')
  expect(traceTypes).toContain('Add')
  expect(traceTypes).toContain('Multiply')
  // After Multiply, control flows directly to the next downstream node (the template), not
  // back to the (now-skipped) macro wrapper.
  const mulIdx = traceTypes.indexOf('Multiply')
  const tplIdx = traceTypes.indexOf('$templateInstance')
  expect(tplIdx).toBe(mulIdx + 1)
})

test('expanded full run paints the macro pill GREEN via member transitivity', async ({ page }) => {
  await ready(page)
  await toggleMacro(page) // expand
  await start(page)
  await cont(page)
  await page.waitForTimeout(300)
  const s = await snap(page)
  expect(s.status).toBe('finished')
  // After the expanded run, all members done → macro itself should be 'ok' so its pill paints
  // green when the user collapses it back (otherwise it looks unvisited — image #21 complaint).
  const macroId = await page.evaluate(() => {
    type W = { __xenoDebug: { macroId: string } }
    return (window as unknown as W).__xenoDebug.macroId
  })
  expect(s.nodeStatuses[macroId]).toBe('ok')
})

test('Start → toggle expand mid-debug → continue steps into members, keeps visited', async ({ page }) => {
  await ready(page)
  await start(page)            // collapsed; paused on first Const
  await step(page)             // const 1 → ok
  await step(page)             // const 2 → ok
  await step(page)             // const 3 → ok
  await toggleMacro(page)      // expand mid-debug
  await page.waitForTimeout(150)
  // After toggle: order is rebuilt with expanded members; cursor fast-forwards past visited
  // Consts and lands on Add (or first unvisited member of the now-expanded macro).
  const after = await snap(page)
  expect(after.status).toBe('paused')
  // Continue to the end — every member should execute now.
  await cont(page)
  await page.waitForTimeout(300)
  const done = await snap(page)
  expect(done.status).toBe('finished')
  const traceTypes = done.history.map((r) => r.type)
  expect(traceTypes).toContain('Add')
  expect(traceTypes).toContain('Multiply')
})

test('Start collapsed → step PAST the macro → expand → continue MUST step into members', async ({ page }) => {
  // The image #22 scenario: user stepped past the macro as one collapsed unit, then expanded
  // mid-debug expecting to inspect the now-visible members one by one. The old code added
  // members to `visited` via macro→members transitivity → advance auto-skipped Add+Multiply →
  // debugger jumped straight to Probe. Fixed: expanding NEVER propagates macro→members.
  await ready(page)
  await start(page)
  await step(page) // const 1
  await step(page) // const 2
  await step(page) // const 3
  await step(page) // Macro Compute (collapsed unit)
  const before = await snap(page)
  expect(before.history.map((r) => r.type)).toContain('Macro')
  // Now expand mid-debug.
  await toggleMacro(page)
  await page.waitForTimeout(150)
  const after = await snap(page)
  expect(after.status).toBe('paused')
  // The cursor MUST land on Add (first member of the expanded macro), NOT on the downstream
  // Template — otherwise the macro's internals were silently skipped, which was the bug.
  expect(after.currentType).toBe('Add')
  await cont(page)
  await page.waitForTimeout(300)
  const done = await snap(page)
  expect(done.status).toBe('finished')
  const types = done.history.map((r) => r.type)
  expect(types).toContain('Add')
  expect(types).toContain('Multiply')
})

test('REPRO image #25: Start → Expand → Step×3, planned walk must show 7 with Add+Mul (NOT 6 with Macro)', async ({ page }) => {
  await ready(page)
  await start(page)
  await toggleMacro(page)         // expand
  await page.waitForTimeout(300)
  await step(page)                // const 1
  await step(page)                // const 2
  await step(page)                // const 3
  const after = await snap(page)
  // After three steps the cursor must be on Add (next member), not Probe.
  expect(after.currentType).toBe('Add')
  // The planned-walk DOM text must reflect the expanded order (7 steps incl. Add and Multiply).
  const plannedText = await page.locator('text=/Planned walk \\(\\d+ steps?\\)/').first().innerText()
  expect(plannedText).toContain('7 steps')
  // Also assert the listed type names include Add and Multiply.
  const plannedList = await page.evaluate(() => {
    const panels = [...document.querySelectorAll('.panel, [class*="Panel"], *')].filter((el) => /Planned walk/.test(el.textContent ?? ''))
    return panels[0]?.textContent ?? ''
  })
  expect(plannedList).toMatch(/Add/)
  expect(plannedList).toMatch(/Multiply/)
})

test('DIAG2: state machine — after toggle macro should flip collapsed→false and order should grow to 7', async ({ page }) => {
  await ready(page)
  const getState = async () => await page.evaluate(() => {
    type W = { __xenoDebug: { editor: { graph: { getNode(id: string): { state: Record<string, unknown> } | undefined } }; macroId: string; debugger: { order: ReadonlyArray<string>; status: string } } }
    const d = (window as unknown as W).__xenoDebug
    return {
      collapsed: d.editor.graph.getNode(d.macroId)?.state['collapsed'],
      order: d.debugger.order.length,
      status: d.debugger.status,
    }
  })
  const init = await getState()
  expect(init.collapsed).toBe(true)
  await start(page)
  const afterStart = await getState()
  expect(afterStart.collapsed).toBe(true)
  expect(afterStart.order).toBe(6)
  await toggleMacro(page)
  await page.waitForTimeout(400)
  const afterToggle = await getState()
  // If toggleMacro really called expandMacro, state.collapsed must now be false AND the rebuilt
  // order must be 7 items (expanded: Const×3 + Add + Mul + Template + Display, no Macro).
  expect(afterToggle.collapsed).toBe(false)
  expect(afterToggle.order).toBe(7)
})

test('DIAG: after expand+continue, Add/Mul views are visible and their status rings would actually paint', async ({ page }) => {
  await ready(page)
  await start(page)
  await step(page)
  await toggleMacro(page)
  await page.waitForTimeout(400) // let expand animation settle
  await cont(page)
  await page.waitForTimeout(500) // let any post-continue render settle
  const diag = await page.evaluate(() => {
    type Container = { visible: boolean; alpha: number; parent: Container | null; x: number; y: number }
    type View = { container: Container }
    type Ed = {
      graph: { nodes(): Iterable<{ id: string; type: string }> }
    } & { ['__views']?: Map<string, View> }
    const ed = (window as unknown as { __xenoDebug: { editor: Ed } }).__xenoDebug.editor
    // Reach into the private #views via the public ringDraw path: every node should have an entry.
    // We can't access #views directly across a class boundary; instead, infer "view paints" by
    // calling setNodeStatus + reading whether #statusGfx paints. But also: read view via reflection
    // on the editor instance — Object.values for any Map property named _views or #views.
    // PIXI nodes ARE addressable through editor.app.stage. Walk the world children looking for
    // node container by id metadata if present; otherwise just rely on the public node info.
    const types: Record<string, { id: string }> = {}
    for (const n of ed.graph.nodes()) if (n.type === 'Add' || n.type === 'Multiply') types[n.type] = { id: n.id }
    return {
      members: types,
      // Editor doesn't expose #nodeStatus publicly. But the demo mirrors it on window.__xenoNodeStatus.
      statuses: (window as unknown as { __xenoNodeStatus?: Record<string, string> }).__xenoNodeStatus ?? {},
    }
  })
  // Logical status must be 'ok' on both members.
  expect(diag.statuses[diag.members['Add']!.id]).toBe('ok')
  expect(diag.statuses[diag.members['Multiply']!.id]).toBe('ok')

  const cap = await captureCanvas(page)
  const greenPixels = countPixelsNear(cap, RING_OK)
  expect(greenPixels).toBeGreaterThan(100)
})

test('REPRO image #23: Start → Step ONCE (only Const_a) → Expand → Continue → Add+Mul green', async ({ page }) => {
  // The exact scenario from user image #23/#24: only ONE step before expand. After Continue
  // every member must end up with status='ok' AND appear in the trace. Smaller visited set
  // than the earlier test — covers off-by-one in the advance loop / order rebuild.
  await ready(page)
  await start(page)
  await step(page) // ONLY const_a
  const before = await snap(page)
  expect(before.history.map((r) => r.type)).toEqual(['Const'])
  expect(before.history).toHaveLength(1)
  // Expand mid-debug.
  await toggleMacro(page)
  await page.waitForTimeout(150)
  const afterExpand = await snap(page)
  expect(afterExpand.status).toBe('paused')
  // The first un-visited node after the toggle MUST be the second Const, not jump straight to Add.
  expect(afterExpand.currentType).toBe('Const')
  // Continue to the end.
  await cont(page)
  await page.waitForTimeout(400)
  const done = await snap(page)
  expect(done.status).toBe('finished')
  const traceTypes = done.history.map((r) => r.type)
  // Trace must contain Add and Multiply — proves they actually executed.
  expect(traceTypes).toContain('Add')
  expect(traceTypes).toContain('Multiply')
  // And the visual status must be 'ok' on each (otherwise the green ring won't paint).
  const memberIds = await page.evaluate(() => {
    type W = { __xenoDebug: { editor: { graph: { nodes(): Iterable<{ id: string; type: string }> } } } }
    const ed = (window as unknown as W).__xenoDebug.editor
    const out: Record<string, string> = {}
    for (const n of ed.graph.nodes()) if (n.type === 'Add' || n.type === 'Multiply') out[n.type] = n.id
    return out
  })
  expect(done.nodeStatuses[memberIds['Add']!]).toBe('ok')
  expect(done.nodeStatuses[memberIds['Multiply']!]).toBe('ok')
})

test('clicking the macro node during debug adds a breakpoint DOM badge (red dot in overlayRoot)', async ({ page }) => {
  await ready(page)
  await start(page)
  // Simulate a real pointer click on the macro Compute pill at its on-screen position.
  const click = await page.evaluate(() => {
    type Node = { id: string; type: string; position: { x: number; y: number }; size?: { x: number; y: number } }
    type W = { __xenoDebug: { editor: { graph: { nodes(): Iterable<Node> }; worldToScreen: (p: { x: number; y: number }) => { x: number; y: number } } } }
    const ed = (window as unknown as W).__xenoDebug.editor
    let macro: Node | null = null
    for (const n of ed.graph.nodes()) if (n.type === 'Macro') { macro = n; break }
    if (!macro) return null
    // Centre of the node in screen space (canvas-local).
    const cx = macro.position.x + (macro.size?.x ?? 200) / 2
    const cy = macro.position.y + (macro.size?.y ?? 80) / 2
    const screen = ed.worldToScreen({ x: cx, y: cy })
    const rect = document.querySelector('canvas')!.getBoundingClientRect()
    return { x: rect.left + screen.x, y: rect.top + screen.y }
  })
  expect(click).not.toBeNull()
  await page.mouse.click(click!.x, click!.y)
  await page.waitForTimeout(150)
  const dotCount = await page.locator('[data-breakpoint]').count()
  expect(dotCount).toBeGreaterThanOrEqual(1)
})

test('paused on a node animates each of its incoming edges (and clears on finish)', async ({ page }) => {
  await ready(page)
  await start(page)
  await step(page) // const_a → ok
  await step(page) // const_b → ok
  await step(page) // const_c → ok; pause on Macro Compute (collapsed) — edges feeding it animate
  const animated = await page.evaluate(() => (window as unknown as { __xenoAnimatedEdges?: string[] }).__xenoAnimatedEdges ?? [])
  // Macro Compute receives THREE incoming edges (a→Compute, b→Compute, c→Compute) when collapsed.
  expect(animated).toHaveLength(3)
  // Continue to finish; animated set MUST be cleared (no dangling animation after the run).
  await cont(page)
  await page.waitForTimeout(300)
  const after = await page.evaluate(() => (window as unknown as { __xenoAnimatedEdges?: string[] }).__xenoAnimatedEdges ?? [])
  expect(after).toHaveLength(0)
})

test('collapsing AFTER a run clears member statuses (no ghost ring)', async ({ page }) => {
  await ready(page)
  await toggleMacro(page) // expand
  await start(page)
  await cont(page)
  await page.waitForTimeout(300)
  // Now collapse. Members should lose their 'ok' status BEFORE being hidden.
  await toggleMacro(page)
  const s = await snap(page)
  // After toggle, debugger is reset and statuses are wiped — no node should be 'ok' or 'running'.
  for (const [, status] of Object.entries(s.nodeStatuses)) {
    expect(['idle', 'error']).toContain(status)
  }
})
