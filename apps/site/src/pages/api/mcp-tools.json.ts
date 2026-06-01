// `/api/mcp-tools.json` — machine-readable catalogue of every MCP tool the XenolithGraph
// MCP server exposes. Generated from the single source of truth (`TOOLS` in
// `@xenolith/mcp-server`) so it never drifts.

import type { APIRoute } from 'astro'
import { TOOLS } from '@xenolith/mcp-server'
import { zodToJsonSchema } from 'zod-to-json-schema'

interface ToolJson {
  name: string
  description: string
  inputSchema: ReturnType<typeof zodToJsonSchema>
}

function render(): { server: string; version: string; tools: ToolJson[] } {
  return {
    server: '@xenolith/mcp-server',
    version: '0.0.0',
    tools: Object.values(TOOLS).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.schema, { target: 'jsonSchema7', name: t.name }),
    })),
  }
}

export const GET: APIRoute = () =>
  new Response(JSON.stringify(render(), null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  })
