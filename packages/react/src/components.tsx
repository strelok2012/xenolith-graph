import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode, ReactElement, ReactPortal, ButtonHTMLAttributes } from 'react'
import type { MinimapPosition, ControlsOptions } from '@xenolith/editor'
import { useXenolithEditor } from './context.js'

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

export type XenolithControlsProps = ControlsOptions

/**
 * Built-in viewport controls (zoom / fit / reset / undo·redo / save / lock). Declarative wrapper over
 * the editor's vanilla `setControls` — the toolbar itself is rendered by the CORE in `overlayRoot`
 * (shared by every framework, themed via `--xeno-*`), so this component renders no DOM of its own.
 */
export function XenolithControls(props: XenolithControlsProps): null {
  const editor = useXenolithEditor()
  const key = JSON.stringify(props)
  useEffect(() => {
    if (!editor) return
    editor.setControls(props)
    return () => editor.setControls(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, key])
  return null
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
