// The examples gallery manifest — ONE entry per example, with per-framework implementations.
// Each example page (/examples/<id>) has a framework switcher that swaps the LIVE demo + the
// "Show code" tabs between React / Vue / Svelte / Solid / Angular. React ships first; the others
// are disabled ("soon") in the switcher until their demos land — kept per-framework so the page
// shows one framework at a time and never becomes a jumble.

export type Framework = 'vanilla' | 'react' | 'vue' | 'svelte' | 'solid' | 'angular'

// Order matters in the framework switcher chip row: vanilla first because plain JS is the universal
// baseline (no React/Vue/anything required), then framework-specific implementations.
export const FRAMEWORKS: { key: Framework; label: string }[] = [
  { key: 'vanilla', label: 'JS' },
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
export const CATEGORY_ORDER = ['Showcases', 'Nodes', 'Widgets', 'Interaction', 'Styling', 'Viewport', 'Layout', 'Performance'] as const

export const EXAMPLES: ExampleDef[] = [
  { id: 'mcp-live', title: 'MCP live (AI builds the graph)', category: 'Showcases',
    blurb: 'Start @xenolith/mcp-server locally, click Connect, then ask Claude Desktop / Cursor to build a graph. The AI calls list_node_types → add_node → connect_pins → auto_layout. "I describe it, the editor builds it."',
    impls: { react: { files: ['demos/MCPDemo.tsx'] } } },
  { id: 'step-debugger', title: 'Visual stepping debugger', category: 'Showcases',
    blurb: 'Run a graph one node at a time. Yellow ring = paused; green = executed; red = breakpoint. The inspector shows live inputs/outputs and per-node timing. Debug your AI workflow on the canvas — like Chrome DevTools, but for nodes.',
    impls: { react: { files: ['demos/StepDebuggerDemo.tsx'] } } },
  { id: 'time-travel', title: 'Time-travel scrubber', category: 'Showcases',
    blurb: 'Rewind a graph run. Drag the timeline through every step and watch the highlights replay — green = done, yellow = the step under inspection. The inspector shows that step’s inputs and outputs.',
    impls: { react: { files: ['demos/TimeTravelDemo.tsx'] } } },
  { id: 'graph-diff', title: 'Graph diff (PR review)', category: 'Showcases',
    blurb: 'Two versions of a graph side by side, with structural diff highlights — green = added, red = removed, yellow = modified. Drop-in PR-review for node graphs.',
    impls: { react: { files: ['demos/GraphDiffDemo.tsx'] } } },
  { id: 'heatmap', title: 'Per-node cost heatmap', category: 'Showcases',
    blurb: 'A RAG pipeline with per-node latency badges — cool blue → hot red. Press Pulse to see metrics breathe. Drop-in observability overlay; no OSS competitor ships it.',
    impls: { react: { files: ['demos/HeatmapDemo.tsx'] } } },
  { id: 'llm-builder', title: 'LLM workflow builder', category: 'Showcases',
    blurb: 'Input → Prompt → Model → Output. Press Run; the chain walks in topological order, the active node glows, the completion streams into the Output. A prettier LangFlow, on Xenolith.',
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
    blurb: 'The simplest custom widget: a click/drag level bar, drawn in WebGL — no DOM. The value flows back to your app via the standard widget callback.',
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
  { id: 'conditional-widgets', title: 'Conditional widgets', category: 'Widgets',
    blurb: 'Declarative `displayOptions.show(state)` — n8n-style. One HTTP Request node hides `body` until the method needs one, and `token` until auth is `bearer`. Pure schema: no `setNodeWidgets` plumbing in the host. The node re-layouts and edges stay attached as widgets appear and disappear.',
    impls: {
      vanilla: { files: ['vanilla/conditional-widgets.ts', 'shared/conditional-widgets.ts'] },
      react:   { files: ['demos/ConditionalWidgetsDemo.tsx', 'shared/conditional-widgets.ts'] },
    } },
  { id: 'properties-sidebar', title: 'Properties sidebar', category: 'Interaction',
    blurb: 'A "fat" node with 8 widgets opts into the docked properties panel via the per-widget `showInSidebar: true` flag. Edit live — the same widget renders inline AND in the panel; no separate sidebar component to author. Themed via --xeno-*. Open programmatically: `editor.openSidebar(nodeId)`.',
    impls: {
      vanilla: { files: ['vanilla/properties-sidebar.ts', 'shared/properties-sidebar.ts'] },
      react:   { files: ['demos/PropertiesSidebarDemo.tsx', 'shared/properties-sidebar.ts'] },
    } },
  { id: 'two-way', title: 'Two-way data binding', category: 'Interaction',
    blurb: 'Both binding levels in one: `useSelection()` edits the selected node’s widgets; `useGraphJSON()` binds the whole graph ⇄ JSON. No manual event wiring.',
    impls: { react: { files: ['demos/TwoWayBindingDemo.tsx'] } } },
  { id: 'diagram', title: 'Diagram edges', category: 'Showcases',
    blurb: 'Edges as a diagramming primitive — text nodes wired with directional arrowhead markers, edge labels (pass / fail / retry), and an animated flowing dash on the main path. Toggle the flow.',
    impls: { react: { files: ['shared/diagram.json', 'demos/DiagramDemo.tsx', 'shared/diagram.ts'] } } },
  { id: 'type-conversions', title: 'Type conversions', category: 'Interaction',
    blurb: 'Typed pins of different types refuse to connect — unless you register a conversion. NumberSource (out: number) won’t wire into TextSink (in: text) until `types.registerConversion("number", "text", String)` is called. Toggle the cast live; the existing edge drops when it disappears.',
    impls: {
      vanilla: { files: ['vanilla/type-conversions.ts', 'shared/type-conversions.ts'] },
      react:   { files: ['demos/TypeConversionsDemo.tsx', 'shared/type-conversions.ts'] },
    } },
  { id: 'breadcrumb-dive', title: 'Subgraph breadcrumb', category: 'Interaction',
    blurb: 'Nested template instances (Pipeline → Stage → primitives). Dive in by double-click OR programmatically; the breadcrumb in the top-left tracks the path (Root › Pipeline › Stage) and pops any segment. Auto-themed via --xeno-*. Opt-out with `editor.setBreadcrumbVisible(false)`.',
    impls: {
      vanilla: { files: ['vanilla/breadcrumb-dive.ts', 'shared/breadcrumb-dive.ts'] },
      react:   { files: ['demos/BreadcrumbDiveDemo.tsx', 'shared/breadcrumb-dive.ts'] },
    } },
  { id: 'connection-validation', title: 'Connection validation', category: 'Interaction',
    blurb: 'Typed Blueprint pins refuse mismatched wires automatically (a string won’t plug into a number). A custom guard adds cycle prevention on top. Every attempt is logged live.',
    impls: { react: { files: ['shared/connection-validation.json', 'demos/ConnectionValidationDemo.tsx', 'shared/connection-validation.ts'] } } },
  { id: 'export-image', title: 'Export to image', category: 'Interaction',
    blurb: 'Export the whole graph — not just the viewport — to a Blob at any scale. Download PNG, retina 2×, or JPG straight from a panel.',
    impls: { react: { files: ['demos/ExportImageDemo.tsx', 'shared/export-image.ts'] } } },
  { id: 'preview-nodes', title: 'Per-node canvas drawing', category: 'Widgets',
    blurb: 'Sparkline + ColorPreview nodes — each paints its own body via a CanvasWidgetController (the equivalent of LiteGraph onDrawForeground). The sparkline rolls a live plot of the upstream slider; the swatch fills from `node.state.tint`. Anything you can draw on a `<canvas>` can be a node body.',
    impls: {
      vanilla: { files: ['vanilla/preview-nodes.ts', 'shared/preview-nodes.ts'] },
      react:   { files: ['demos/PreviewNodesDemo.tsx', 'shared/preview-nodes.ts'] },
    } },
  { id: 'edge-paths', title: 'Edge path styles', category: 'Styling',
    blurb: 'Per-edge `pathStyle`: bezier (default Xen S-curve), smoothstep (rounded orthogonal), step (90° elbows), linear (straight). Set on construction or live via `editor.setEdgeOptions(id, { pathStyle })`. Same wire colour / animated dash / arrowhead contract regardless of shape.',
    impls: {
      vanilla: { files: ['vanilla/edge-paths.ts', 'shared/edge-paths.ts'] },
      react:   { files: ['demos/EdgePathsDemo.tsx', 'shared/edge-paths.ts'] },
    } },
  { id: 'theming', title: 'Theming', category: 'Styling',
    blurb: 'Theme is a reactive prop — flip Xen ⇄ Liquid Glass at runtime; panels/widgets restyle via --xeno-*.',
    impls: { react: { files: ['demos/ThemingDemo.tsx'] } } },
  { id: 'nested-layout', title: 'Nested auto-layout (ELK)', category: 'Layout',
    blurb: 'Three levels of nested macros — Encoder/Decoder containing Attention/FFN containing leaf ops. ELK respects the hierarchy (children stay inside their parent frame); dagre ignores parent and pancakes everything. Toggle to see the difference.',
    impls: {
      vanilla: { files: ['vanilla/nested-layout.ts', 'shared/nested-layout.ts'] },
      react:   { files: ['demos/NestedLayoutDemo.tsx', 'shared/nested-layout.ts'] },
    } },
  { id: 'auto-layout', title: 'Auto-layout (dagre)', category: 'Layout',
    blurb: 'A messy 14-node DAG snaps into a clean layered layout. Toggle LR/TB; Cmd+Z restores the mess in a single undo step.',
    impls: {
      vanilla: { files: ['vanilla/auto-layout.ts', 'shared/auto-layout.ts'] },
      react:   { files: ['demos/AutoLayoutDemo.tsx', 'shared/auto-layout.ts'] },
    } },
  { id: 'viewport', title: 'Viewport & minimap', category: 'Viewport',
    blurb: 'Built-in controls (zoom/fit/reset/undo/redo/save/lock), toggleable minimap, live useNodes/useViewport readout.',
    impls: { react: { files: ['demos/ViewportDemo.tsx'] } } },
  { id: 'stress-test', title: 'Stress test (1000s of nodes)', category: 'Showcases',
    blurb: 'Generate hundreds → thousands of WebGL nodes wired into a chain. Live FPS + node-count overlay top-right; the panel counter is driven by the reactive `useNodes()` hook. Zoom floor dropped to 5% so 10k+ nodes fit on one screen.',
    impls: { react: { files: ['demos/StressTestDemo.tsx', 'shared/stress-test.ts'] } } },
]

export function getExample(id: string): ExampleDef | undefined {
  return EXAMPLES.find((e) => e.id === id)
}
