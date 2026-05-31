// A1 showcase — conditional widgets (n8n-style `displayOptions.show`). One HTTP Request node
// declares 5 widgets; two of them only appear when other widgets hold specific values:
//   - `body` is visible only when `method` ≠ 'GET'   (GET requests have no body)
//   - `token` is visible only when `auth` = 'bearer' (other auth modes don't need a token)
// Switch the combos: the node grows/shrinks, widget rects relayout, edges stay attached.
// Pure schema — no `setNodeWidgets` plumbing in the host.

import type { XenolithEditor } from '@xenolith/editor'
import type { NodeId, PinId } from '@xenolith/core'

export interface ConditionalWidgetsScene {
  nodeId: NodeId
  setMethod: (m: 'GET' | 'POST' | 'PUT') => void
  setAuth: (a: 'none' | 'basic' | 'bearer') => void
  state: () => Record<string, unknown>
}

const inPin = (key: string, type: string): { id: PinId; kind: 'data'; direction: 'in'; type: string; multiple: false; label: string } =>
  ({ id: `req_${key}` as PinId, kind: 'data', direction: 'in', type, multiple: false, label: key })

export function buildConditionalWidgets(editor: XenolithEditor): ConditionalWidgetsScene {
  const id = 'request' as NodeId
  editor.loadJSON({
    version: 'xenolith.v1',
    nodes: [
      {
        id, type: 'HTTPRequest', position: { x: 80, y: 80 },
        state: {
          url: 'https://api.example.com/users',
          method: 'GET',
          body: '{ "name": "Ada" }',
          auth: 'none',
          token: '',
        },
        render: { title: 'HTTP Request', category: 'logic' },
        pins: [
          inPin('url',    'string'),
          inPin('method', 'string'),
          inPin('body',   'string'),
          inPin('auth',   'string'),
          inPin('token',  'string'),
          { id: 'req_out' as PinId, kind: 'data', direction: 'out', type: 'object', multiple: true, label: 'response' },
        ],
        widgets: [
          { id: 'url',    type: 'text',   key: 'url',    label: '' },
          { id: 'method', type: 'combo',  key: 'method', label: '', values: ['GET', 'POST', 'PUT'] },
          // displayOptions.show — the whole point of this showcase. When false, the widget hides
          // AND so does its pin-row (label + dot) — core understands a hidden widget's pin is also
          // hidden. The pin still exists for serialization & connectivity rules; it just doesn't
          // render. Re-evaluated after every setWidgetValue.
          { id: 'body', type: 'text', key: 'body', label: '',
            displayOptions: { show: (s) => s['method'] !== 'GET' } },
          { id: 'auth', type: 'combo', key: 'auth', label: '', values: ['none', 'basic', 'bearer'] },
          { id: 'token', type: 'text', key: 'token', label: '', placeholder: 'Bearer token…',
            displayOptions: { show: (s) => s['auth'] === 'bearer' } },
        ],
      },
    ],
    edges: [],
  })
  editor.fitView({ padding: 80, maxZoom: 1 })

  return {
    nodeId: id,
    setMethod: (m) => editor.setWidgetValue(id, 'method', m),
    setAuth:   (a) => editor.setWidgetValue(id, 'auth',   a),
    state: () => ({ ...(editor.graph.getNode(id)?.state ?? {}) }),
  }
}
