import { z, type ZodTypeAny } from 'zod'

/** A declarative MCP tool. The server registers each one with the MCP SDK and routes the call to
 *  the connected editor via the WS bridge by name. Tools are intentionally thin — the editor owns
 *  validation and command semantics; the server just shapes the request and forwards it. */
export interface ToolDef<Schema extends ZodTypeAny> {
  /** Stable tool name. MCP clients invoke by this; the WS protocol forwards by this. */
  name: string
  /** Free-text description shown to the LLM. */
  description: string
  /** Input schema (zod). Becomes JSON-Schema for the MCP advertisement. */
  schema: Schema
}

export const TOOLS = {
  list_node_types: {
    name: 'list_node_types',
    description: 'List every node type registered in the editor with its pins (direction/label/type). ALWAYS call this before add_node and connect_pins so you can use the real type names and pin labels — otherwise pins will not match.',
    schema: z.object({}).strict(),
  },
  get_graph: {
    name: 'get_graph',
    description: 'Return the current graph as xenolith.v1 JSON (nodes, edges, comments). Read-only snapshot.',
    schema: z.object({}).strict(),
  },
  add_node: {
    name: 'add_node',
    description: 'Insert a node of the given type. Coordinates are OPTIONAL: if omitted the editor drops it just to the right of the existing graph (or at the origin if empty). Prefer adding all nodes without coordinates, then calling auto_layout once to tidy the whole picture — the LLM has no idea about node sizes/spacing, so manual coords almost always overlap.',
    schema: z.object({
      type: z.string().describe('Node type as listed by list_node_types (e.g. "Source", "Filter", "Output").'),
      x: z.number().optional().describe('Optional world-space X. Omit unless the user explicitly asked for a position.'),
      y: z.number().optional().describe('Optional world-space Y. Omit unless the user explicitly asked for a position.'),
      state: z.record(z.unknown()).optional().describe('Optional initial state map (widget values etc).'),
    }).strict(),
  },
  connect_pins: {
    name: 'connect_pins',
    description: 'Connect an output pin (from) to a compatible input pin (to). Pin types must match (float→float, object→object). The `pin` field accepts the pin LABEL ("Output", "In") as returned by list_node_types, OR a numeric index ("0", "1"), OR the literal "in"/"out" for simple single-pin nodes — pick whatever is easiest. Never invent uuids. On error the response lists the available pins so you can retry.',
    schema: z.object({
      from: z.object({ node: z.string(), pin: z.union([z.string(), z.number()]).describe('Pin label, index, or "out".') }),
      to:   z.object({ node: z.string(), pin: z.union([z.string(), z.number()]).describe('Pin label, index, or "in".') }),
    }).strict(),
  },
  fit_view: {
    name: 'fit_view',
    description: 'Frame the whole graph (or a specific node subset) in the viewport with padding. No return value.',
    schema: z.object({
      nodeIds: z.array(z.string()).optional().describe('Optional subset to frame; default = entire graph.'),
      padding: z.number().optional(),
    }).strict(),
  },
  set_widget_value: {
    name: 'set_widget_value',
    description: 'Set the value of a widget on a node (slider/number/toggle/combo/text/color/custom). Value type must match the widget type (number for slider/number, boolean for toggle, string for combo/text/color, arbitrary JSON for custom). Undoable.',
    schema: z.object({
      nodeId: z.string(),
      widget: z.string().describe('Widget id or key as listed in list_node_types pin/widget arrays.'),
      value: z.unknown(),
    }).strict(),
  },
  remove_node: {
    name: 'remove_node',
    description: 'Delete a node by id. Incident edges are removed automatically. Undoable.',
    schema: z.object({ nodeId: z.string() }).strict(),
  },
  disconnect_edge: {
    name: 'disconnect_edge',
    description: 'Remove an edge by id (as returned by connect_pins or get_graph).',
    schema: z.object({ edgeId: z.string() }).strict(),
  },
  create_macro: {
    name: 'create_macro',
    description: 'Wrap a set of nodes into a collapsed Macro (group). External edges touching the selection become proxy pins on the macro, so the macro behaves like a single node from the outside. Returns the macro id.',
    schema: z.object({
      nodeIds: z.array(z.string()).min(1),
      title: z.string().optional().describe('Display title; defaults to "Macro".'),
    }).strict(),
  },
  expand_macro: {
    name: 'expand_macro',
    description: 'Open a collapsed macro inline — members become visible again. Camera animates to fit the group automatically.',
    schema: z.object({ macroId: z.string() }).strict(),
  },
  collapse_macro: {
    name: 'collapse_macro',
    description: 'Re-collapse an expanded macro back into a single node with proxy pins.',
    schema: z.object({ macroId: z.string() }).strict(),
  },
  auto_layout: {
    name: 'auto_layout',
    description: 'Tidy the entire graph: re-position every node using a layered left-to-right layout based on edge topology (sources on the left, sinks on the right). Call this AFTER adding nodes/edges so the result looks like a hand-arranged graph instead of overlapping boxes. Safe to call multiple times.',
    schema: z.object({
      direction: z.enum(['LR', 'TB']).optional().describe('LR = left-to-right (default, good for pipelines), TB = top-to-bottom (good for tall trees).'),
      spacing: z.number().optional().describe('Pixels of padding between nodes (default 80).'),
    }).strict(),
  },
} as const satisfies Record<string, ToolDef<ZodTypeAny>>

export type ToolName = keyof typeof TOOLS
export const TOOL_NAMES = Object.keys(TOOLS) as ToolName[]
