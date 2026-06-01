# @xenolith/mcp-server

MCP (Model Context Protocol) server for XenolithGraph. Lets Claude Desktop, Cursor, or any MCP client drive a live editor in your browser over a localhost WebSocket bridge.

## Architecture (Scenario A — desktop dev)

```
Claude Desktop ──stdio JSON-RPC──▶ xenolith-mcp (Node)
                                        │
                                        ▼
                              WebSocket bridge (127.0.0.1:7777)
                                        │
                                        ▼
                              Browser editor (editor.connectMCP)
```

- MCP client speaks stdio JSON-RPC to the CLI.
- The CLI hosts a localhost WS bridge.
- Your XenolithGraph editor opens a WS to the bridge and registers itself as the "current" world.
- Tool calls from Claude → CLI → WS → editor → result → back to Claude.

## Resources exposed

Read-only context the MCP client can **attach** to its prompt without spending a tool call. In Claude Desktop / Cursor, these show up in the attachment picker next to local files.

| URI | What |
|---|---|
| `graph://current` | The live graph as `xenolith.v1` JSON. Attach this to ask the AI to summarise / refactor / explain the current state. |
| `schema://types` | Every registered node type with pin & widget specs. Attach this so the AI doesn't have to call `list_node_types` every session — saves a roundtrip and 10× tokens against large registries (Comfy 60k+ types). |

Resources route to the same WS bridge as tools; if no editor is connected they return an error blob instead of failing the MCP request.

## Tools exposed

| Tool | What it does |
|---|---|
| `list_node_types` | Lists every registered node type (so the LLM picks a real name). |
| `get_graph` | Returns the current graph as `xenolith.v1` JSON. |
| `add_node` | Inserts a node by type at `(x, y)`. Returns its id. |
| `connect_pins` | Connects two pins by node-id + pin-id. Returns edge id. |
| `fit_view` | Fits the whole graph into the viewport. |

All mutations route through the editor's CommandBus, so undo/redo and events fire normally.

---

## How to test (full walkthrough)

### 1. Build the workspace

```bash
pnpm install
pnpm --filter @xenolith/editor build
pnpm --filter @xenolith/mcp-server build
chmod +x packages/mcp-server/dist/cli.js
```

### 2. Start the MCP server (separate terminal)

```bash
node packages/mcp-server/dist/cli.js --port 7777 --token devtoken
```

It prints to stderr:

```
[xenolith-mcp] bridge listening on ws://127.0.0.1:7777

  XenolithGraph MCP server ready.
  Editor URL  →  ws://127.0.0.1:7777?token=devtoken
  In the browser console of your XenolithGraph host, run:
      editor.connectMCP('ws://127.0.0.1:7777?token=devtoken')
```

stdout is reserved for the MCP JSON-RPC framing — never log there.

> The CLI is **always-on stdio**. When you run it manually like above without an MCP client attached, it just sits waiting. Ctrl+C to stop.

### 3. Wire the editor in the browser

Open the playground (`pnpm playground`) or any host that mounts a XenolithGraph editor. In DevTools console:

```js
await window.__xenoEditor.connectMCP('ws://127.0.0.1:7777?token=devtoken', {
  onStatus: (s) => console.log('[mcp]', s),
})
```

You should see `[mcp] connecting` → `[mcp] open` and the CLI stderr prints `editor connected (e1); 1 total`.

### 4. Drive it from a temporary local MCP client (no Claude Desktop needed)

Quick smoke without going through Claude — use the MCP SDK as a client:

```bash
cat > /tmp/mcp-smoke.mjs <<'EOF'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const transport = new StdioClientTransport({
  command: 'node',
  args: ['packages/mcp-server/dist/cli.js', '--port', '7777', '--token', 'devtoken'],
})
const client = new Client({ name: 'smoke', version: '0' })
await client.connect(transport)

console.log('tools:', (await client.listTools()).tools.map((t) => t.name))
console.log('add_node →', await client.callTool({ name: 'add_node', arguments: { type: 'Box', x: 100, y: 100 } }))
console.log('graph →', await client.callTool({ name: 'get_graph', arguments: {} }))

await client.close()
EOF
cd /Users/vitaliyry/PET_PROJECTS/xenolith-graph && node /tmp/mcp-smoke.mjs
```

> Note: this client spawns its OWN CLI process, so kill the manual one from step 2 first (or pass a different `--port`). The browser editor must already be connected to whichever bridge port the client uses.

If everything works you'll see a `Box` node appear in the browser playground and the tool result JSON in the terminal.

### 5. Hook into Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "xenolith": {
      "command": "node",
      "args": [
        "/Users/vitaliyry/PET_PROJECTS/xenolith-graph/packages/mcp-server/dist/cli.js",
        "--port", "7777",
        "--token", "devtoken"
      ]
    }
  }
}
```

Restart Claude Desktop. In a new chat you'll see a tools icon (🔧). Ask:

> "Use the xenolith add_node tool to add a Box node at (200, 200)."

Claude will call the tool, the bridge forwards it, and the node pops into your browser editor.

### 6. Troubleshooting

- **`no editor connected`** — the browser tab didn't run `connectMCP` (or it disconnected). Re-run in console.
- **`bad token`** — the URL you pasted has a different token than the CLI was started with.
- **port already in use** — kill the previous process or pick `--port 7778`. Update the editor URL to match.
- **Claude doesn't see the tools** — Claude Desktop only re-reads the config on restart; quit it fully (Cmd+Q), not just close the window.
- **Tool times out** — defaults to 5s. The editor probably threw or you're paused in DevTools.

## Programmatic embedding

```ts
import { EditorBridge, createMcpServer, startStdio } from '@xenolith/mcp-server'

const bridge = new EditorBridge({ port: 7777, token: 'mytoken' })
await bridge.start()
const mcp = createMcpServer(bridge)
await startStdio(mcp)
```
