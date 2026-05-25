import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode, ReactElement, ReactPortal, ButtonHTMLAttributes } from 'react'
import type { MinimapPosition } from '@xenolith/editor'
import { useXenolithEditor } from './context.js'
import { IconZoomIn, IconZoomOut, IconFit, IconReset, IconUndo, IconRedo } from './icons.js'

export type PanelPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

const POS: Record<PanelPosition, CSSProperties> = {
  'top-left':      { top: 12, left: 12 },
  'top-center':    { top: 12, left: '50%', transform: 'translateX(-50%)' },
  'top-right':     { top: 12, right: 12 },
  'bottom-left':   { bottom: 12, left: 12 },
  'bottom-center': { bottom: 12, left: '50%', transform: 'translateX(-50%)' },
  'bottom-right':  { bottom: 12, right: 12 },
}

export interface XenolithPanelProps {
  position?: PanelPosition
  /** Drop the default frosted card chrome and only anchor the children. */
  bare?: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

/**
 * An absolutely-positioned overlay anchored inside the editor (React Flow's `<Panel>` analogue).
 * Renders into the editor's screen-anchored overlay layer via a portal, so debug readouts, controls,
 * legends — any React UI — live *inside* the graph. Inherits the theme's `--xeno-*` vars from the host.
 */
export function XenolithPanel({ position = 'top-left', bare, className, style, children }: XenolithPanelProps): ReactPortal | null {
  const editor = useXenolithEditor()
  if (!editor) return null
  const chrome: CSSProperties = bare ? {} : {
    background: 'var(--xeno-panel)',
    border: '1px solid var(--xeno-border)',
    borderRadius: 10,
    padding: 10,
    color: 'var(--xeno-text)',
    boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 13,
  }
  return createPortal(
    <div
      data-xeno-panel=""
      className={className}
      style={{ position: 'absolute', pointerEvents: 'auto', ...POS[position], ...chrome, ...style }}
    >
      {children}
    </div>,
    editor.overlayRoot,
  )
}

export interface XenolithButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Render in the accent colour (filled) instead of the neutral control surface. */
  active?: boolean
}

/**
 * A control button themed from the editor's `--xeno-*` vars, so it tracks the active theme (gold in
 * Xen, cyan in Liquid Glass) for free. Use inside a `<XenolithPanel>` / `<XenolithControls>`.
 */
export function XenolithButton({ active, style, children, disabled, ...rest }: XenolithButtonProps): ReactElement {
  return (
    <button
      type="button"
      data-xeno-button=""
      disabled={disabled}
      style={{
        font: 'inherit',
        fontSize: 13,
        lineHeight: 1,
        padding: '7px 12px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        borderRadius: 8,
        border: `1px solid ${active ? 'var(--xeno-accent)' : 'var(--xeno-border)'}`,
        background: active ? 'var(--xeno-accent)' : 'var(--xeno-elevated)',
        color: active ? 'var(--xeno-canvas)' : 'var(--xeno-text)',
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

export interface XenolithControlsProps {
  position?: PanelPosition
  /** Zoom multiplier per click (default 1.2). */
  zoomStep?: number
  showZoom?: boolean
  showFit?: boolean
  showReset?: boolean
  showHistory?: boolean
}

const CTRL_BTN: CSSProperties = { width: 30, height: 30, padding: 0, display: 'grid', placeItems: 'center' }
const SEP: CSSProperties = { width: 1, alignSelf: 'stretch', background: 'var(--xeno-border)', margin: '2px 2px' }

/**
 * Ready-made viewport controls (React Flow's `<Controls>` analogue): undo / redo, zoom out / in,
 * fit, reset — with Feather icons. Lives inside the editor as a `<XenolithPanel>`; buttons inherit
 * the theme via `--xeno-*`.
 */
export function XenolithControls({
  position = 'bottom-left', zoomStep = 1.2,
  showZoom = true, showFit = true, showReset = true, showHistory = true,
}: XenolithControlsProps): ReactElement | null {
  const editor = useXenolithEditor()
  // Track history depth so undo/redo grey out when their stack is empty (fresh editor = both empty).
  const [history, setHistory] = useState({ canUndo: false, canRedo: false })
  useEffect(() => {
    if (!editor) return
    return editor.on('history:changed', ({ canUndo, canRedo }) => setHistory({ canUndo, canRedo }))
  }, [editor])
  if (!editor) return null
  const focal = (): { x: number; y: number } => ({
    x: editor.overlayRoot.clientWidth / 2,
    y: editor.overlayRoot.clientHeight / 2,
  })
  return (
    <XenolithPanel position={position} style={{ display: 'flex', gap: 6, padding: 6 }}>
      {showHistory && (
        <XenolithButton aria-label="Undo" title="Undo" style={CTRL_BTN} disabled={!history.canUndo} onClick={() => editor.undo()}><IconUndo /></XenolithButton>
      )}
      {showHistory && (
        <XenolithButton aria-label="Redo" title="Redo" style={CTRL_BTN} disabled={!history.canRedo} onClick={() => editor.redo()}><IconRedo /></XenolithButton>
      )}
      {showHistory && (showZoom || showFit || showReset) && <span style={SEP} />}
      {showZoom && (
        <XenolithButton aria-label="Zoom out" title="Zoom out" style={CTRL_BTN} onClick={() => editor.zoomAt(focal(), 1 / zoomStep)}><IconZoomOut /></XenolithButton>
      )}
      {showZoom && (
        <XenolithButton aria-label="Zoom in" title="Zoom in" style={CTRL_BTN} onClick={() => editor.zoomAt(focal(), zoomStep)}><IconZoomIn /></XenolithButton>
      )}
      {showFit && (
        <XenolithButton aria-label="Fit view" title="Fit view" style={CTRL_BTN} onClick={() => editor.fitView({ padding: 48, maxZoom: 1 })}><IconFit /></XenolithButton>
      )}
      {showReset && (
        <XenolithButton aria-label="Reset view" title="Reset view" style={CTRL_BTN} onClick={() => editor.resetView()}><IconReset /></XenolithButton>
      )}
    </XenolithPanel>
  )
}

export interface XenolithMiniMapProps {
  position?: MinimapPosition
}

/**
 * Declarative minimap toggle (React Flow's `<MiniMap>` analogue). The minimap itself is rendered in
 * WebGL by the editor; mounting this component enables it and sets its anchor, and unmounting hides
 * it. Renders no DOM of its own.
 */
export function XenolithMiniMap({ position = 'bottom-right' }: XenolithMiniMapProps): null {
  const editor = useXenolithEditor()
  useEffect(() => {
    if (!editor) return
    editor.setMinimapVisible(true)
    editor.setMinimapPosition(position)
    return () => { editor.setMinimapVisible(false) }
  }, [editor, position])
  return null
}
