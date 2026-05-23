import { XenolithEditor } from '@xenolith/editor'
import { createNodeId, createPinId, type Node, type Pin } from '@xenolith/core'
import { xenTheme, type XenolithTheme } from '@xenolith/render-pixi'
import { liquidGlassTheme } from '@xenolith/theme-liquid-glass'

function pin(direction: 'in' | 'out', type: string, label: string): Pin {
  return {
    id: createPinId(),
    kind: 'data',
    direction,
    type,
    multiple: direction === 'out',
    label,
  }
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

const THEMES: Record<string, XenolithTheme> = {
  xen: xenTheme,
  'liquid-glass': liquidGlassTheme,
}

async function buildShowcase(mountEl: HTMLElement, theme: XenolithTheme) {
  // Don't use PIXI's `resizeTo` — at init time the mount can be 0px tall (aspect-ratio CSS
  // applies AFTER first layout pass), and PIXI then sticks with that 0px height. We size
  // manually via ResizeObserver below.
  const editor = await XenolithEditor.init(mountEl, {
    theme,
    resizeToWindow: false,
    viewport: { x: 40, y: 40, zoom: 0.72 },
  })

  const fitToMount = (): void => {
    const w = mountEl.clientWidth
    const h = mountEl.clientHeight
    if (w > 0 && h > 0) editor.app.renderer.resize(w, h)
  }
  // First fit: the editor is mounted; aspect-ratio:16/10 has applied; sizes are real now.
  fitToMount()
  // Track future container size changes (responsive layout, font-load reflow, etc.)
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => fitToMount())
    ro.observe(mountEl)
  }

  // Generous spacing — 220px horizontal between columns, 180px vertical between rows.
  // Showcases get cropped to a wide aspect ratio, so the eye reads the flow even when zoomed out.
  const N = {
    source:    mk({ type: 'Source',    position: { x: 40,  y: 40  }, size: { x: 150, y: 70  }, pins: [pin('out', 'float',  'Output')] }),
    sample:    mk({ type: 'Sample',    position: { x: 40,  y: 260 }, size: { x: 150, y: 85  }, pins: [pin('in', 'float', 'In'), pin('out', 'float', 'Out')] }),
    filter:    mk({ type: 'Filter',    position: { x: 40,  y: 480 }, size: { x: 150, y: 85  }, pins: [pin('in', 'float', 'In'), pin('out', 'float', 'Out')] }),
    cache:     mk({ type: 'Cache',     position: { x: 40,  y: 700 }, size: { x: 150, y: 70  }, pins: [pin('in', 'object', 'In'), pin('out', 'object', 'Out')] }),
    gather:    mk({ type: 'Gather',    position: { x: 320, y: 220 }, size: { x: 150, y: 105 }, pins: [pin('in','float','A'), pin('in','float','B'), pin('in','object','C'), pin('out','object','Out')] }),
    pack:      mk({ type: 'Pack',      position: { x: 320, y: 540 }, size: { x: 150, y: 85  }, pins: [pin('in','object','In'), pin('in','float','Tag'), pin('out','object','Pack')] }),
    transform: mk({ type: 'Transform', position: { x: 600, y: 140 }, size: { x: 150, y: 70  }, pins: [pin('in','object','In'), pin('out','object','Out')] }),
    validate:  mk({ type: 'Validate',  position: { x: 600, y: 340 }, size: { x: 150, y: 85  }, pins: [pin('in','object','In'), pin('out','wildcard','Out')] }),
    enrich:    mk({ type: 'Enrich',    position: { x: 600, y: 560 }, size: { x: 150, y: 85  }, pins: [pin('in','object','In'), pin('out','object','Out')] }),
    macroA:    mk({ type: 'Pipeline',  position: { x: 880, y: 80  }, size: { x: 150, y: 70  }, pins: [pin('in','object','In'), pin('out','string','Out')] }),
    macroB:    mk({ type: 'Score',     position: { x: 880, y: 240 }, size: { x: 150, y: 70  }, pins: [pin('in','object','In'), pin('out','float','Out')] }),
    macroC:    mk({ type: 'Resolve',   position: { x: 880, y: 420 }, size: { x: 150, y: 85  }, pins: [pin('in','object','In'), pin('in','float','Hint'), pin('out','string','Out')] }),
    macroD:    mk({ type: 'Format',    position: { x: 880, y: 620 }, size: { x: 150, y: 70  }, pins: [pin('in','string','In'), pin('out','string','Out')] }),
    sink1:     mk({ type: 'Display',   position: { x: 1160, y: 120 }, size: { x: 150, y: 70  }, pins: [pin('in','string','In'), pin('out','any','Out')] }),
    sink2:     mk({ type: 'Audit',     position: { x: 1160, y: 280 }, size: { x: 150, y: 70  }, pins: [pin('in','float','In'), pin('out','any','Out')] }),
    sink3:     mk({ type: 'Persist',   position: { x: 1160, y: 440 }, size: { x: 150, y: 70  }, pins: [pin('in','string','In'), pin('out','any','Out')] }),
    sink4:     mk({ type: 'Notify',    position: { x: 1160, y: 600 }, size: { x: 150, y: 70  }, pins: [pin('in','string','In'), pin('out','any','Out')] }),
    sink5:     mk({ type: 'Archive',   position: { x: 1440, y: 360 }, size: { x: 150, y: 70  }, pins: [pin('in','any','In'),  pin('out','any','Out')] }),
  }

  editor.addNode(N.source,    { category: 'logic',   title: 'Source'    })
  editor.addNode(N.sample,    { category: 'logic',   title: 'Sample'    })
  editor.addNode(N.filter,    { category: 'logic',   title: 'Filter',    collapsed: true })
  editor.addNode(N.cache,     { category: 'data',    title: 'Cache',     collapsed: true })
  editor.addNode(N.gather,    { category: 'macro',   title: 'Gather'    })
  editor.addNode(N.pack,      { category: 'macro',   title: 'Pack'      })
  editor.addNode(N.transform, { category: 'data',    title: 'Transform' })
  editor.addNode(N.validate,  { category: 'data',    title: 'Validate'  })
  editor.addNode(N.enrich,    { category: 'data',    title: 'Enrich'    })
  editor.addNode(N.macroA,    { category: 'macro',   title: 'Pipeline', collapsed: true })
  editor.addNode(N.macroB,    { category: 'macro',   title: 'Score',    collapsed: true })
  editor.addNode(N.macroC,    { category: 'macro',   title: 'Resolve'   })
  editor.addNode(N.macroD,    { category: 'macro',   title: 'Format',   collapsed: true })
  editor.addNode(N.sink1,     { category: 'utility', title: 'Display'   })
  editor.addNode(N.sink2,     { category: 'utility', title: 'Audit'     })
  editor.addNode(N.sink3,     { category: 'utility', title: 'Persist'   })
  editor.addNode(N.sink4,     { category: 'utility', title: 'Notify'    })
  editor.addNode(N.sink5,     { category: 'utility', title: 'Archive'   })

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
  editor.connect(N.validate,  1, N.macroA,    0, { sourceType: 'wildcard' })
  editor.connect(N.enrich,    1, N.macroB,    0, { sourceType: 'object' })
  editor.connect(N.enrich,    1, N.macroC,    0, { sourceType: 'object' })
  editor.connect(N.pack,      2, N.macroC,    1, { sourceType: 'float'  })
  editor.connect(N.macroC,    2, N.macroD,    0, { sourceType: 'string' })
  editor.connect(N.macroA,    1, N.sink1,     0, { sourceType: 'string' })
  editor.connect(N.macroB,    1, N.sink2,     0, { sourceType: 'float'  })
  editor.connect(N.macroC,    2, N.sink3,     0, { sourceType: 'string' })
  editor.connect(N.macroD,    1, N.sink4,     0, { sourceType: 'string' })
  editor.connect(N.sink1,     1, N.sink5,     0, { sourceType: 'any'    })
  editor.connect(N.sink3,     1, N.sink5,     0, { sourceType: 'any'    })

  return editor
}

export function mountAllShowcases(): void {
  const mounts = document.querySelectorAll<HTMLElement>('[data-xeno-showcase]')
  for (const el of Array.from(mounts)) {
    if (el.dataset['xenoMounted']) continue
    el.dataset['xenoMounted'] = '1'
    const themeName = el.dataset['xenoTheme'] ?? 'xen'
    const theme = THEMES[themeName] ?? xenTheme
    void buildShowcase(el, theme).catch((err) => {
      console.error('[xeno-showcase] init failed', err)
    })
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAllShowcases)
  } else {
    mountAllShowcases()
  }
}
