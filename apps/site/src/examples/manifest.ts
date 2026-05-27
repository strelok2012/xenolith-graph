// The examples gallery manifest — ONE entry per example, with per-framework implementations.
// Each example page (/examples/<id>) has a framework switcher that swaps the LIVE demo + the
// "Show code" tabs between React / Vue / Svelte / Solid / Angular. React ships first; the others
// are disabled ("soon") in the switcher until their demos land — kept per-framework so the page
// shows one framework at a time and never becomes a jumble.

export type Framework = 'react' | 'vue' | 'svelte' | 'solid' | 'angular'

export const FRAMEWORKS: { key: Framework; label: string }[] = [
  { key: 'react', label: 'React' },
  { key: 'vue', label: 'Vue' },
  { key: 'svelte', label: 'Svelte' },
  { key: 'solid', label: 'Solid' },
  { key: 'angular', label: 'Angular' },
]

/** One framework's implementation of an example: the source files shown under "Show code".
 *  (The live component is resolved by `${framework}:${id}` in the island registry.) */
export interface ExampleImpl {
  files: string[]
}

export interface ExampleDef {
  id: string
  title: string
  blurb: string
  category: string
  /** Which frameworks implement this example, and each one's source files. */
  impls: Partial<Record<Framework, ExampleImpl>>
}

// Category order in the gallery grid.
export const CATEGORY_ORDER = ['Showcases', 'Overview', 'Nodes', 'Widgets', 'Interaction', 'Styling', 'Viewport'] as const

export const EXAMPLES: ExampleDef[] = [
  { id: 'llm-builder', title: 'LLM workflow builder', category: 'Showcases',
    blurb: 'Input → Prompt → Model → Output. Run walks the graph (topoOrder + incomers), lights the active node, and streams the completion into the Output node. A prettier LangFlow, on Xenolith.',
    impls: { react: { files: ['shared/llm-builder.json', 'demos/LLMBuilderDemo.tsx', 'shared/llm-builder.ts'] } } },
  { id: 'audio-synth', title: 'Audio synth (Web Audio)', category: 'Showcases',
    blurb: 'A real synth built on the graph — Oscillator → Filter → Gain → Output. Knobs are node widgets; Play wires live AudioNodes and lights the active chain. It makes sound.',
    impls: { react: { files: ['shared/audio-synth.json', 'demos/AudioSynthDemo.tsx', 'shared/audio-synth.ts'] } } },
  { id: 'save-restore', title: 'Save & restore', category: 'Showcases',
    blurb: 'The whole graph is JSON. Download / upload a .json file, and autosave to localStorage on every edit (driven by useGraphJSON). Reload the page — it comes back.',
    impls: { react: { files: ['demos/SaveRestoreDemo.tsx', 'shared/save-restore.ts'] } } },
  { id: 'image-pipeline', title: 'Image pipeline (WebGL)', category: 'Showcases',
    blurb: 'A real image-filter pipeline — Source → Exposure → Saturation → Hue → Blur → Vignette → Result. Each node is a live GLSL fragment pass. Drag a slider and the result re-renders; drop your own image; download the PNG.',
    impls: { react: { files: ['demos/ImagePipelineDemo.tsx', 'shared/image-pipeline.ts'] } } },
  { id: 'overview', title: 'Feature overview', category: 'Overview',
    blurb: 'The canonical graph with full chrome — controls + minimap. Drag, connect, pan, zoom.',
    impls: { react: { files: ['demos/OverviewDemo.tsx'] } } },
  { id: 'mount', title: 'Mount an editor', category: 'Nodes',
    blurb: 'The honest minimum: register a node type, add one, frame it. Xen is the default theme — no setup.',
    impls: { react: { files: ['shared/mount.json', 'demos/MountDemo.tsx', 'shared/mount.ts'] } } },
  { id: 'load', title: 'Load a graph', category: 'Nodes',
    blurb: 'Load a real saved xenolith.v1 graph and reframe it. Built-in controls + a reload panel.',
    impls: { react: { files: ['demos/LoadDemo.tsx', 'shared/scene.ts'] } } },
  { id: 'builtin-widgets', title: 'Built-in widgets', category: 'Widgets',
    blurb: 'Every built-in widget — slider, number, toggle, combo, color, text — on one node, in WebGL.',
    impls: { react: { files: ['shared/builtin-widgets.json', 'demos/BuiltinWidgetsDemo.tsx', 'shared/builtin-widgets.ts'] } } },
  { id: 'canvas-widget', title: 'Custom canvas widget', category: 'Widgets',
    blurb: 'The simplest custom widget: a click/drag level bar — two functions, no DOM. Value caught in app state.',
    impls: { react: { files: ['shared/canvas-widget.json', 'demos/CanvasWidgetDemo.tsx', 'shared/canvas-widget.ts'] } } },
  { id: 'custom-widgets', title: 'Bring your own UI', category: 'Widgets',
    blurb: 'Four widgets that are real framework components (async-select, file drop, CodeMirror, sparkline), themed via --xeno-*.',
    impls: { react: { files: [
      'demos/CustomWidgetsDemo.tsx',
      'widgets/AsyncSelect.tsx', 'widgets/FileDrop.tsx', 'widgets/CodeEditor.tsx', 'widgets/Sparkline.tsx',
    ] } } },
  { id: 'events', title: 'Events → your state', category: 'Interaction',
    blurb: 'Typed event callbacks wired to app state: a live log, selection inspector, widget values.',
    impls: { react: { files: ['demos/EventsDemo.tsx'] } } },
  { id: 'two-way', title: 'Two-way data binding', category: 'Interaction',
    blurb: 'Both hook levels in one: useSelection() edits a node’s widgets, useGraphJSON() binds the whole graph ⇄ JSON. No event plumbing.',
    impls: { react: { files: ['demos/TwoWayBindingDemo.tsx'] } } },
  { id: 'diagram', title: 'Diagram edges', category: 'Showcases',
    blurb: 'Edges as a diagramming primitive — text nodes wired with directional arrowhead markers, edge labels (pass / fail / retry), and an animated flowing dash on the main path. Toggle the flow.',
    impls: { react: { files: ['shared/diagram.json', 'demos/DiagramDemo.tsx', 'shared/diagram.ts'] } } },
  { id: 'connection-validation', title: 'Connection validation', category: 'Interaction',
    blurb: 'Typed Blueprint pins refuse mismatched wires automatically (a string won’t plug into a number). A custom isValidConnection guard uses the core wouldCreateCycle() helper to forbid loops. Every attempt is logged live.',
    impls: { react: { files: ['shared/connection-validation.json', 'demos/ConnectionValidationDemo.tsx', 'shared/connection-validation.ts'] } } },
  { id: 'export-image', title: 'Export to image', category: 'Interaction',
    blurb: 'editor.exportImage() renders the whole graph — not just the viewport — to a Blob at any scale. Download PNG, retina 2×, or JPG straight from a panel.',
    impls: { react: { files: ['demos/ExportImageDemo.tsx', 'shared/export-image.ts'] } } },
  { id: 'theming', title: 'Theming', category: 'Styling',
    blurb: 'Theme is a reactive prop — flip Xen ⇄ Liquid Glass at runtime; panels/widgets restyle via --xeno-*.',
    impls: { react: { files: ['demos/ThemingDemo.tsx'] } } },
  { id: 'viewport', title: 'Viewport & minimap', category: 'Viewport',
    blurb: 'Built-in controls (zoom/fit/reset/undo/redo/save/lock), toggleable minimap, live useNodes/useViewport readout.',
    impls: { react: { files: ['demos/ViewportDemo.tsx'] } } },
]

export function getExample(id: string): ExampleDef | undefined {
  return EXAMPLES.find((e) => e.id === id)
}
