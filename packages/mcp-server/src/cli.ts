#!/usr/bin/env node
import { randomBytes } from 'node:crypto'
import { EditorBridge } from './bridge.js'
import { createMcpServer, startStdio } from './server.js'

/** xenolith-mcp — CLI entrypoint.
 *  Reads --port (default 7777) and --token (default = random). Spawns the WS bridge and MCP server.
 *  Logs everything to STDERR; stdout is reserved for the MCP JSON-RPC framing.
 *  On startup prints the editor URL (with token) so the user can paste it into
 *  `editor.connectMCP('ws://...')` in the browser console. */
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const port = Number(arg(args, '--port') ?? 7777)
  const token = arg(args, '--token') ?? randomBytes(8).toString('hex')

  const bridge = new EditorBridge({ port, token })
  const listeningPort = await bridge.start()
  process.stderr.write([
    '',
    '  XenolithGraph MCP server ready.',
    `  Editor URL  →  ws://127.0.0.1:${listeningPort}?token=${token}`,
    '  In the browser console of your XenolithGraph host, run:',
    `      editor.connectMCP('ws://127.0.0.1:${listeningPort}?token=${token}')`,
    '',
  ].join('\n'))

  const mcp = createMcpServer(bridge)
  await startStdio(mcp)

  const stop = async (): Promise<void> => { await bridge.stop(); process.exit(0) }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}

function arg(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

main().catch((err) => {
  process.stderr.write(`[xenolith-mcp] fatal: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
