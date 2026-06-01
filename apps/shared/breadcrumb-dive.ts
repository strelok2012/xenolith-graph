// G7 showcase — subgraph breadcrumb. Two-level nested template: a top-level "Pipeline" template
// containing a "Stage" sub-template instance, which itself contains two primitive nodes.
// Double-click the Pipeline node to dive in; you'll see the Stage instance + a primitive.
// Double-click Stage to dive deeper. The breadcrumb auto-appears in the top-left:
//   Root › Pipeline › Stage   (click "Root" or "Pipeline" to pop back).

import type { XenolithEditor } from '@xenolith/editor'

export interface BreadcrumbDiveScene {
  /** Programmatic dive into Pipeline (top-level template instance) — same as double-clicking. */
  diveInto: (slug: 'pipeline' | 'stage') => boolean
  /** Pop back to root. */
  diveOut: () => void
  depth: () => number
}

/** Dive into a named slug from any depth — pops back to root first so the button works whether
 *  the user already drilled in or not. Returns true if the dive succeeded. */
export function diveIntoSlug(editor: XenolithEditor, slug: 'pipeline' | 'stage'): boolean {
  if (editor.diveDepth !== 0) editor.diveOut(0)
  if (slug === 'pipeline') return editor.diveInto('main' as never)
  editor.diveInto('main' as never)
  return editor.diveInto('p_stage' as never)
}

/** Idempotent setup: load the nested template graph. Safe to pass to `<XenolithGraph onReady>`. */
export function setupBreadcrumbDive(editor: XenolithEditor): void { void buildBreadcrumbDive(editor) }

/** @deprecated Prefer `setupBreadcrumbDive` + `diveIntoSlug`. Kept for vanilla examples. */
export function buildBreadcrumbDive(editor: XenolithEditor): BreadcrumbDiveScene {
  // ── Innermost: a Stage template definition with two primitive members. ────────────────────
  const stageDef = {
    title: 'Stage',
    nodes: [
      { id: 'sin', type: '$templateInput', position: { x: 0, y: 60 }, state: {},
        render: { title: 'Input · value', category: 'macro' },
        pins: [{ id: 'sin_o', kind: 'data', direction: 'out', type: 'float', multiple: true, label: 'value' }] },
      { id: 's_proc', type: 'Op', position: { x: 220, y: 40 }, size: { x: 160, y: 56 }, state: {},
        render: { title: 'Process', category: 'logic' },
        pins: [
          { id: 's_proc_i', kind: 'data', direction: 'in',  type: 'float', multiple: false, label: 'in' },
          { id: 's_proc_o', kind: 'data', direction: 'out', type: 'float', multiple: true,  label: 'out' },
        ] },
      { id: 's_norm', type: 'Op', position: { x: 440, y: 40 }, size: { x: 160, y: 56 }, state: {},
        render: { title: 'Normalize', category: 'logic' },
        pins: [
          { id: 's_norm_i', kind: 'data', direction: 'in',  type: 'float', multiple: false, label: 'in' },
          { id: 's_norm_o', kind: 'data', direction: 'out', type: 'float', multiple: true,  label: 'out' },
        ] },
      { id: 'sout', type: '$templateOutput', position: { x: 660, y: 60 }, state: {},
        render: { title: 'Output · result', category: 'macro' },
        pins: [{ id: 'sout_i', kind: 'data', direction: 'in', type: 'float', multiple: false, label: 'result' }] },
    ],
    edges: [
      { id: 's_e0', from: { node: 'sin',    pin: 'sin_o'    }, to: { node: 's_proc', pin: 's_proc_i' } },
      { id: 's_e1', from: { node: 's_proc', pin: 's_proc_o' }, to: { node: 's_norm', pin: 's_norm_i' } },
      { id: 's_e2', from: { node: 's_norm', pin: 's_norm_o' }, to: { node: 'sout',   pin: 'sout_i'   } },
    ],
  }

  // ── Middle: Pipeline definition contains ONE Stage instance + a Source primitive. ────────
  const pipelineDef = {
    title: 'Pipeline',
    nodes: [
      { id: 'pin', type: '$templateInput', position: { x: 0, y: 60 }, state: {},
        render: { title: 'Input · input', category: 'macro' },
        pins: [{ id: 'pin_o', kind: 'data', direction: 'out', type: 'float', multiple: true, label: 'input' }] },
      { id: 'p_src', type: 'Op', position: { x: 220, y: 40 }, size: { x: 160, y: 56 }, state: {},
        render: { title: 'Tokenize', category: 'logic' },
        pins: [
          { id: 'p_src_i', kind: 'data', direction: 'in',  type: 'float', multiple: false, label: 'in' },
          { id: 'p_src_o', kind: 'data', direction: 'out', type: 'float', multiple: true,  label: 'out' },
        ] },
      // Nested template instance — double-clicking THIS dives a level deeper.
      { id: 'p_stage', type: '$templateInstance', position: { x: 440, y: 40 },
        state: { definitionId: 'tpl:stage', pinBoundary: { p_stage_in: 'sin', p_stage_out: 'sout' } },
        render: { title: 'Stage', category: 'macro' },
        pins: [
          { id: 'p_stage_in',  kind: 'data', direction: 'in',  type: 'float', multiple: false, label: 'value' },
          { id: 'p_stage_out', kind: 'data', direction: 'out', type: 'float', multiple: true,  label: 'result' },
        ] },
      { id: 'pout', type: '$templateOutput', position: { x: 660, y: 60 }, state: {},
        render: { title: 'Output · output', category: 'macro' },
        pins: [{ id: 'pout_i', kind: 'data', direction: 'in', type: 'float', multiple: false, label: 'output' }] },
    ],
    edges: [
      { id: 'p_e0', from: { node: 'pin',     pin: 'pin_o'        }, to: { node: 'p_src',   pin: 'p_src_i'     } },
      { id: 'p_e1', from: { node: 'p_src',   pin: 'p_src_o'      }, to: { node: 'p_stage', pin: 'p_stage_in'  } },
      { id: 'p_e2', from: { node: 'p_stage', pin: 'p_stage_out'  }, to: { node: 'pout',    pin: 'pout_i'      } },
    ],
  }

  // ── Outer document: one Pipeline instance. Double-click to dive in (breadcrumb appears). ──
  editor.loadJSON({
    version: 'xenolith.v1',
    // Templates are an OBJECT keyed by id (matches the file format on disk).
    templates: { 'tpl:stage': stageDef, 'tpl:pipeline': pipelineDef } as never,
    nodes: [
      { id: 'main', type: '$templateInstance', position: { x: 200, y: 200 },
        state: { definitionId: 'tpl:pipeline', pinBoundary: { main_in: 'pin', main_out: 'pout' } },
        render: { title: 'Pipeline', category: 'macro' },
        pins: [
          { id: 'main_in',  kind: 'data', direction: 'in',  type: 'float', multiple: false, label: 'input' },
          { id: 'main_out', kind: 'data', direction: 'out', type: 'float', multiple: true,  label: 'output' },
        ] },
    ],
    edges: [],
  })
  editor.fitView({ padding: 80, maxZoom: 1 })

  return {
    diveInto: (slug) => {
      // "Dive into Pipeline" must work from any depth — `main` lives in the ROOT graph, so pop
      // all the way back first. Without this, pressing the button from inside Stage tried to
      // find a `main` node in Stage's definition and silently failed.
      if (editor.diveDepth !== 0) editor.diveOut(0)
      if (slug === 'pipeline') return editor.diveInto('main' as never)
      // For Stage: ensure we're inside Pipeline first.
      editor.diveInto('main' as never)
      return editor.diveInto('p_stage' as never)
    },
    diveOut: () => editor.diveOut(0),
    depth: () => editor.diveDepth,
  }
}
