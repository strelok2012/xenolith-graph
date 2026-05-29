# Core ask: let an Output-style node self-render its widget without host plumbing

## Goal
`@xenolith/plugin-runtime` ships an `Output` primitive — an exec node that takes a wired value and
displays it inside the node via a custom canvas widget. Today the **host** has to mirror the value
into the widget after every tick (one loop reading `output:<nodeId>` VM vars and calling
`editor.setWidgetValue(id, 'value', v, { ephemeral: true })`). It works, but it leaks plugin wiring
out into every consumer app.

Goal: make `Output` **fully self-contained inside the plugin** — register the node + canvas widget,
and the value updates live with zero host code.

## Why the plugin can't do it today
- `Output.run(io)` lives inside `Runtime` (VM). It can mutate `node.state` on its `RtNode` — but
  `editor.graphSnapshot()` returns `state: { ...n.state }` (a COPY), so the mutation never reaches
  the editor's real `Node`.
- `PluginContext` doesn't surface the host's `Runtime` instance, so the plugin can't itself iterate
  Output nodes after a tick and call `setWidgetValue`.
- The render path reads from `editor.graph.getNode(id).state[key]` — only an editor-side write
  reaches the rendered widget.

## Two equivalent ways to fix it (pick one)

### Option A — `ctx.setWidgetValue` ALREADY exists; just need the plugin to know which nodes are Output
The plugin can scan `ctx.graph.nodes()` for `type === 'Output'` after each tick and call
`ctx.setWidgetValue(n.id, 'value', n.state.value, { ephemeral: true })`. The missing piece is **a
tick hook** that runs *after* the host's VM tick. `ctx.onTick(cb)` exists but it fires the editor's
clock, not the host's compute step. Tiny addition:
- **`ctx.afterCompute(cb)`** (or document that hosts should call `ctx.onTick` with their own clock
  and the plugin can register a listener). One line in core.

But this still requires the host to **forward `Output` node ids and current values to the plugin** —
because the plugin doesn't know what the VM wrote. So Option A degenerates back to host plumbing.

### Option B (recommended) — let nodes mutate their own state in-place during a tick
The HOST passes `editor.graph.getNode(id)` references (not copies) into the snapshot it gives to the
Runtime. The plugin's `Output.run(io)` would then have an `io.setState(key, value)` (a one-line VM
addition) that mutates `node.state` directly — which is THE SAME object the editor's renderer reads.
No host loop, no var mirroring, no extra hook.

Concretely:
1. Add **`ExecIO.setState(key: string, value: VmValue)`** in `@xenolith/plugin-runtime` (one-liner;
   we already drafted it).
2. Change **`editor.graphSnapshot({ shareState?: boolean })`** to share `state` references (and pin
   array) when `shareState: true`. Default stays the safe copy — only opt-in shares. Hosts that want
   self-rendering Output pass `{ shareState: true }`.
3. Document the contract: with `shareState: true`, a tick may mutate `node.state` in place; the
   editor's renderer picks it up on its next paint (it already re-reads `state` per render).
4. Optional: when `setWidgetValue({ ephemeral: true })` is called, do nothing different — but
   `state` mutation via `setState` should NOT trigger a command/undo (it's the ephemeral path).

## Tests
- Core test for `graphSnapshot({ shareState: true })`: a returned `node.state` is `===` to the
  editor's `graph.getNode(id).state`.
- Plugin test for `setState` (already drafted).
- E2e: an `Output` node wired in a graph displays the live computed value, no host code reading
  `output:` vars or calling `setWidgetValue` for it.

## Why this is the right shape
- Other "self-displaying" nodes (sparklines, mini-graphs, status pills) become trivial — they just
  write their own state.
- It keeps the value path purely inside the graph (`wire → Output.run → state[value] → widget`) —
  no out-of-band var conventions like `output:<id>` to coordinate with the host.
- Hosts that want immutability stay safe (default `shareState: false`).

## Status today (workaround in place)
`Output` publishes to `output:<nodeId>` VM var; `apps/fairqueue-demo`'s host writes it back via
`setWidgetValue({ ephemeral: true })`. Works but ugly. This doc requests the cleanup.
