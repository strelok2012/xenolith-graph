// MCP **resources** — read-only context the AI client can attach to its prompt without spending
// a tool call per read. Each entry binds a stable URI (the spec calls these "resources") to a
// fetcher; the fetcher calls back into the editor via the existing WS bridge using the SAME
// remote tool name we already ship — `get_graph`, `list_node_types`, etc. — so there's no new
// editor surface, just a different MCP-side exposure (resource vs tool).

export interface ResourceDef {
  /** Stable URI shown to MCP clients (e.g. Claude Desktop attachment pane). */
  uri: string
  /** Short display name in the client. */
  name: string
  /** One-line description for the LLM picking the right resource. */
  description: string
  /** MIME type of the returned content. */
  mimeType: string
  /** Existing remote tool name to call via the WS bridge to fetch content. */
  remoteTool: string
}

export const RESOURCES: ReadonlyArray<ResourceDef> = [
  {
    uri: 'graph://current',
    name: 'Current graph',
    description: 'The live editor graph as xenolith.v1 JSON — nodes, edges, comments. Attach this to ask the AI about the current state without forcing it to call get_graph.',
    mimeType: 'application/json',
    remoteTool: 'get_graph',
  },
  {
    uri: 'schema://types',
    name: 'Node type schemas',
    description: 'Every registered node type with its pins (label/direction/data type) and widgets. Attach this so the AI knows the available types before designing a graph — saves a list_node_types call per session.',
    mimeType: 'application/json',
    remoteTool: 'list_node_types',
  },
]
