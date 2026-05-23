import { createNodeId, createPinId, type Node, type Pin } from '@xenolith/core'
import { XenolithEditor } from '@xenolith/editor'
import { xenTheme, type XenolithTheme } from '@xenolith/render-pixi'
import { liquidGlassTheme } from '@xenolith/theme-liquid-glass'

function pin(direction: 'in' | 'out', type: string, label: string): Pin {
  return { id: createPinId(), kind: 'data', direction, type, multiple: direction === 'out', label }
}

function mk(opts: {
  type: string
  position: { x: number; y: number }
  size: { x: number; y: number }
  pins: Pin[]
}): Node {
  return {
    id: createNodeId(),
    type: opts.type,
    position: opts.position,
    size: opts.size,
    state: {},
    pins: opts.pins,
  }
}

const editor = await XenolithEditor.init('#app', {
  viewport: { x: 60, y: 60, zoom: 0.85 },
  theme: liquidGlassTheme,
})

const N = {
  source:    mk({ type: 'Source',    position: { x: 40,  y: 40  }, size: { x: 150, y: 70  }, pins: [pin('out', 'float',  'Output')] }),
  sample:    mk({ type: 'Sample',    position: { x: 40,  y: 170 }, size: { x: 150, y: 85  }, pins: [pin('in','float','In'), pin('out','float','Out')] }),
  filter:    mk({ type: 'Filter',    position: { x: 40,  y: 310 }, size: { x: 150, y: 85  }, pins: [pin('in','float','In'), pin('out','float','Out')] }),
  cache:     mk({ type: 'Cache',     position: { x: 40,  y: 450 }, size: { x: 150, y: 70  }, pins: [pin('in','object','In'), pin('out','object','Out')] }),
  gather:    mk({ type: 'Gather',    position: { x: 260, y: 180 }, size: { x: 150, y: 105 }, pins: [pin('in','float','A'), pin('in','float','B'), pin('in','object','C'), pin('out','object','Out')] }),
  pack:      mk({ type: 'Pack',      position: { x: 260, y: 340 }, size: { x: 150, y: 85  }, pins: [pin('in','object','In'), pin('in','float','Tag'), pin('out','object','Pack')] }),
  transform: mk({ type: 'Transform', position: { x: 480, y: 140 }, size: { x: 150, y: 70  }, pins: [pin('in','object','In'), pin('out','object','Out')] }),
  validate:  mk({ type: 'Validate',  position: { x: 480, y: 260 }, size: { x: 150, y: 85  }, pins: [pin('in','object','In'), pin('out','wildcard','Out')] }),
  enrich:    mk({ type: 'Enrich',    position: { x: 480, y: 400 }, size: { x: 150, y: 85  }, pins: [pin('in','object','In'), pin('out','object','Out')] }),
  score:     mk({ type: 'Score',     position: { x: 700, y: 220 }, size: { x: 150, y: 85  }, pins: [pin('in','object','In'), pin('out','float','Out')] }),
  resolve:   mk({ type: 'Resolve',   position: { x: 700, y: 350 }, size: { x: 150, y: 105 }, pins: [pin('in','object','In'), pin('in','float','Hint'), pin('in','wildcard','Aux'), pin('out','string','Out')] }),
  sink1:     mk({ type: 'Display',   position: { x: 920, y: 120 }, size: { x: 150, y: 70  }, pins: [pin('in','string','In'), pin('out','any','Out')] }),
  sink2:     mk({ type: 'Audit',     position: { x: 920, y: 240 }, size: { x: 150, y: 70  }, pins: [pin('in','float','In'), pin('out','any','Out')] }),
  sink3:     mk({ type: 'Persist',   position: { x: 920, y: 360 }, size: { x: 150, y: 70  }, pins: [pin('in','string','In'), pin('out','any','Out')] }),
}

editor.addNode(N.source,    { category: 'logic',   title: 'Source'    })
editor.addNode(N.sample,    { category: 'logic',   title: 'Sample'    })
editor.addNode(N.filter,    { category: 'logic',   title: 'Filter',    collapsed: true })
editor.addNode(N.cache,     { category: 'data',    title: 'Cache',     collapsed: true })
editor.addNode(N.gather,    { category: 'macro',   title: 'Gather'    })
editor.addNode(N.pack,      { category: 'macro',   title: 'Pack',      collapsed: true })
editor.addNode(N.transform, { category: 'data',    title: 'Transform' })
editor.addNode(N.validate,  { category: 'data',    title: 'Validate'  })
editor.addNode(N.enrich,    { category: 'data',    title: 'Enrich'    })
editor.addNode(N.score,     { category: 'macro',   title: 'Score'     })
editor.addNode(N.resolve,   { category: 'macro',   title: 'Resolve'   })
editor.addNode(N.sink1,     { category: 'utility', title: 'Display'   })
editor.addNode(N.sink2,     { category: 'utility', title: 'Audit'     })
editor.addNode(N.sink3,     { category: 'utility', title: 'Persist'   })

editor.connect(N.source,    0, N.sample,    0, { sourceType: 'float'  })
editor.connect(N.sample,    1, N.filter,    0, { sourceType: 'float'  })
editor.connect(N.filter,    1, N.gather,    0, { sourceType: 'float'  })
editor.connect(N.sample,    1, N.gather,    1, { sourceType: 'float'  })
editor.connect(N.cache,     1, N.gather,    2, { sourceType: 'object' })
editor.connect(N.gather,    3, N.transform, 0, { sourceType: 'object' })
editor.connect(N.gather,    3, N.pack,      0, { sourceType: 'object' })
editor.connect(N.cache,     1, N.pack,      1, { sourceType: 'object' })
editor.connect(N.transform, 1, N.validate,  0, { sourceType: 'object' })
editor.connect(N.transform, 1, N.enrich,    0, { sourceType: 'object' })
editor.connect(N.enrich,    1, N.score,     0, { sourceType: 'object' })
editor.connect(N.enrich,    1, N.resolve,   0, { sourceType: 'object' })
editor.connect(N.score,     1, N.resolve,   1, { sourceType: 'float'  })
editor.connect(N.validate,  1, N.resolve,   2, { sourceType: 'wildcard' })
editor.connect(N.resolve,   3, N.sink1,     0, { sourceType: 'string' })
editor.connect(N.score,     1, N.sink2,     0, { sourceType: 'float'  })
editor.connect(N.resolve,   3, N.sink3,     0, { sourceType: 'string' })

// -----------------------------------------------------------------------------------------------
// Theme switcher — proves runtime setTheme() works. Buttons in the top-left corner of the page.
// -----------------------------------------------------------------------------------------------
const themes: { label: string; theme: XenolithTheme }[] = [
  { label: 'Liquid Glass', theme: liquidGlassTheme },
  { label: 'Xen',          theme: xenTheme },
]
const switcher = document.createElement('div')
switcher.style.cssText = `
  position: fixed; top: 12px; left: 12px; z-index: 1000;
  display: flex; gap: 6px;
  background: rgba(0, 0, 0, 0.35);
  padding: 6px;
  border-radius: 8px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 12px;
`
let active = themes[0]!
for (const entry of themes) {
  const btn = document.createElement('button')
  btn.textContent = entry.label
  btn.style.cssText = `
    padding: 6px 12px;
    border-radius: 5px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: ${entry === active ? 'rgba(255, 255, 255, 0.18)' : 'transparent'};
    color: #fff;
    font: inherit;
    cursor: pointer;
  `
  btn.addEventListener('click', () => {
    if (entry === active) return
    active = entry
    editor.setTheme(entry.theme)
    for (const child of switcher.children) {
      const isActive = (child as HTMLElement).textContent === entry.label
      ;(child as HTMLElement).style.background = isActive ? 'rgba(255, 255, 255, 0.18)' : 'transparent'
    }
  })
  switcher.appendChild(btn)
}
document.body.appendChild(switcher)
