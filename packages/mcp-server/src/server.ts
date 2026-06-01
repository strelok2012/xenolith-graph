import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { EditorBridge } from './bridge.js'
import { TOOLS } from './tools.js'
import { RESOURCES } from './resources.js'

/** Build the MCP server: advertise our tools, and on each tool call forward args to the connected
 *  editor over the WS bridge. The MCP SDK handles stdio framing + JSON-RPC. */
export function createMcpServer(bridge: EditorBridge): McpServer {
  const mcp = new McpServer({ name: 'xenolith-graph', version: '0.0.0' })

  // Resources — read-only context. Each one forwards to an existing remote tool over the WS
  // bridge so the editor needs no separate code path. MCP clients (Claude Desktop / Cursor)
  // list these alongside tools and let the user attach them as context.
  for (const r of RESOURCES) {
    mcp.registerResource(
      r.name,
      r.uri,
      { description: r.description, mimeType: r.mimeType },
      async (uri) => {
        try {
          const data = await bridge.current().call(r.remoteTool, {})
          return { contents: [{ uri: uri.href, mimeType: r.mimeType, text: JSON.stringify(data, null, 2) }] }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: `error: ${message}` }] }
        }
      },
    )
  }

  for (const def of Object.values(TOOLS)) {
    mcp.registerTool(
      def.name,
      { description: def.description, inputSchema: def.schema.shape },
      async (args: unknown) => {
        try {
          const result = await bridge.current().call(def.name, args)
          return { content: [{ type: 'text' as const, text: JSON.stringify(result ?? null) }] }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          return { content: [{ type: 'text' as const, text: `error: ${message}` }], isError: true }
        }
      },
    )
  }

  return mcp
}

export async function startStdio(mcp: McpServer): Promise<void> {
  const transport = new StdioServerTransport()
  await mcp.connect(transport)
}
