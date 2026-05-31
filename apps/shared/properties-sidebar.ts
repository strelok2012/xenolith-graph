// G4 showcase — properties sidebar. The node declares one IN-pin per widget (canon: a widget
// renders inline only when bound to an IN-pin), and EVERY widget is flagged `showInSidebar`.
// Inline you see the editable fields on each pin row; click "Open sidebar" and the panel docks
// on the right, same widgets, themed, scrollable.

import type { XenolithEditor } from '@xenolith/editor'
import type { NodeId, PinId } from '@xenolith/core'

export interface PropertiesSidebarScene {
  nodeId: NodeId
  open: () => void
  close: () => void
  isOpen: () => boolean
}

const inPin = (key: string, type: string): { id: PinId; kind: 'data'; direction: 'in'; type: string; multiple: false; label: string } =>
  ({ id: `mat_${key}` as PinId, kind: 'data', direction: 'in', type, multiple: false, label: key })

export function buildPropertiesSidebar(editor: XenolithEditor): PropertiesSidebarScene {
  const id = 'material' as NodeId
  editor.loadJSON({
    version: 'xenolith.v1',
    nodes: [
      {
        id, type: 'Material', position: { x: 80, y: 60 },
        state: {
          name: 'Untitled material',
          intensity: 0.6,
          tint: '#9F69FF',
          metallic: 0.3,
          roughness: 0.55,
          mode: 'Multiply',
          enabled: true,
          notes: 'Edit me in the sidebar →',
        },
        render: { title: 'Material', category: 'data' },
        pins: [
          inPin('name',       'string'),
          inPin('enabled',    'boolean'),
          inPin('mode',       'string'),
          inPin('intensity',  'float'),
          inPin('metallic',   'float'),
          inPin('roughness',  'float'),
          inPin('tint',       'color'),
          inPin('notes',      'string'),
          { id: 'mat_out' as PinId, kind: 'data', direction: 'out', type: 'object', multiple: true, label: 'out' },
        ],
        // Empty `label` on each widget — they're bound to IN-pins, the pin row already names
        // them. The sidebar will fall back to `key` for its label (Name, Enabled, …). This
        // avoids the inline widget drawing its own label INSIDE the control and overlapping it.
        widgets: [
          { id: 'name',      type: 'text',   key: 'name',      label: '', showInSidebar: true, hint: 'Display name in the asset browser' },
          { id: 'enabled',   type: 'toggle', key: 'enabled',   label: '', showInSidebar: true },
          { id: 'mode',      type: 'combo',  key: 'mode',      label: '', showInSidebar: true, values: ['Add', 'Multiply', 'Subtract', 'Screen'] },
          { id: 'intensity', type: 'slider', key: 'intensity', label: '', showInSidebar: true, min: 0, max: 1, step: 0.01 },
          { id: 'metallic',  type: 'slider', key: 'metallic',  label: '', showInSidebar: true, min: 0, max: 1, step: 0.01 },
          { id: 'roughness', type: 'slider', key: 'roughness', label: '', showInSidebar: true, min: 0, max: 1, step: 0.01 },
          { id: 'tint',      type: 'color',  key: 'tint',      label: '', showInSidebar: true },
          { id: 'notes',     type: 'text',   key: 'notes',     label: '', showInSidebar: true, multiline: true, placeholder: 'Authoring notes…' },
        ],
      },
    ],
    edges: [],
  })
  editor.fitView({ padding: 60, maxZoom: 1 })

  return {
    nodeId: id,
    open: () => editor.openSidebar(id),
    close: () => editor.closeSidebar(),
    isOpen: () => editor.isSidebarOpen(),
  }
}
