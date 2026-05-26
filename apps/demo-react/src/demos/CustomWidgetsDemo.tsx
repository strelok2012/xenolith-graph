import { useState } from 'react'
import { XenolithGraph, XenolithPanel, XenolithButton, XenolithControls } from '@xenolith/react'
import { xenTheme } from '@xenolith/render-pixi'
import { liquidGlassTheme } from '@xenolith/theme-liquid-glass'
import { DemoStage } from '../Layout.js'
import { reactWidget } from '@xenolith/react'
import { AsyncSelect } from '../widgets/AsyncSelect.js'
import { FileDrop } from '../widgets/FileDrop.js'
import { CodeEditor } from '../widgets/CodeEditor.js'
import { Sparkline } from '../widgets/Sparkline.js'

const seedSpark = Array.from({ length: 16 }, (_, i) => 0.5 + 0.4 * Math.sin(i / 2))

const NODES = [
  { type: 'Pick', title: 'Pick fruit', renderer: 'async-select', key: 'fruit', val: 'Mango' as unknown, h: 34, x: 0, y: 0 },
  { type: 'Image', title: 'Image', renderer: 'file-drop', key: 'img', val: '', h: 120, x: 360, y: 0 },
  { type: 'Prompt', title: 'Prompt', renderer: 'code', key: 'json', val: '{\n  "seed": 42\n}', h: 140, x: 0, y: 250 },
  { type: 'Signal', title: 'Signal', renderer: 'sparkline', key: 'data', val: seedSpark, h: 96, x: 360, y: 320 },
]

/** Island: four custom widgets that are real React components (server-search select, image drop,
 *  CodeMirror, sparkline). They style themselves with --xeno-* CSS vars, so flipping the theme from
 *  the in-editor panel restyles them for free — the whole point of the plugin ecosystem. */
export function CustomWidgetsDemo() {
  const [theme, setTheme] = useState<'xen' | 'lg'>('xen')
  return (
    <DemoStage>
      <XenolithGraph
        className="xeno"
        resizeToWindow={false}
        theme={theme === 'xen' ? xenTheme : liquidGlassTheme}
        onReady={(editor) => {
          editor.registerWidget('async-select', reactWidget(AsyncSelect))
          editor.registerWidget('file-drop', reactWidget(FileDrop))
          editor.registerWidget('code', reactWidget(CodeEditor))
          editor.registerWidget('sparkline', reactWidget(Sparkline))
          for (const d of NODES) {
            editor.registry.register({
              type: d.type,
              title: d.title,
              pins: [{ kind: 'data', direction: 'out', type: 'any', label: 'Out' }],
              widgets: [{ id: d.key, label: d.title, type: 'custom', renderer: d.renderer, key: d.key, height: d.h }],
            })
            const node = editor.registry.instantiate(d.type, { x: d.x, y: d.y })
            node.state[d.key] = d.val
            editor.addNode(node)
          }
          editor.fitView({ padding: 56, maxZoom: 1 })
        }}
      >
        <XenolithControls position="top-right" orientation="horizontal" />
        <XenolithPanel position="top-left" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 240 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <XenolithButton active={theme === 'xen'} onClick={() => setTheme('xen')}>Xen</XenolithButton>
            <XenolithButton active={theme === 'lg'} onClick={() => setTheme('lg')}>Liquid Glass</XenolithButton>
          </div>
          <span style={{ color: 'var(--xeno-muted)', fontSize: 11, lineHeight: 1.4 }}>
            Widgets are React components styled with <code>var(--xeno-*)</code> — they restyle on theme change.
          </span>
        </XenolithPanel>
      </XenolithGraph>
    </DemoStage>
  )
}
