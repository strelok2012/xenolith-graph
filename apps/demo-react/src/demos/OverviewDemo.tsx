import { useState } from 'react'
import { XenolithGraph, XenolithControls, XenolithMiniMap, XenolithPanel, XenolithButton } from '@xenolith/react'
import { xenTheme } from '@xenolith/render-pixi'
import { liquidGlassTheme } from '@xenolith/theme-liquid-glass'
import { DemoStage } from '../Layout.js'
import { loadDemo } from '../demo-data.js'

/** The canonical graph with full chrome — theme switcher, controls, minimap. The 10-second "what is this". */
export function OverviewDemo() {
  const [theme, setTheme] = useState<'xen' | 'lg'>('xen')
  return (
    <DemoStage>
      <XenolithGraph
        className="xeno"
        resizeToWindow={false}
        theme={theme === 'xen' ? xenTheme : liquidGlassTheme}
        onReady={loadDemo}
      >
        <XenolithPanel position="top-left" style={{ display: 'flex', gap: 6, padding: 6 }}>
          <XenolithButton active={theme === 'xen'} onClick={() => setTheme('xen')}>Xen</XenolithButton>
          <XenolithButton active={theme === 'lg'} onClick={() => setTheme('lg')}>Liquid Glass</XenolithButton>
        </XenolithPanel>
        <XenolithControls position="bottom-left" />
        <XenolithMiniMap position="bottom-right" />
      </XenolithGraph>
    </DemoStage>
  )
}
