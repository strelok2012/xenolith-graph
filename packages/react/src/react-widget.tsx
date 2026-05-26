import { createRoot, type Root } from 'react-dom/client'
import type { ReactNode } from 'react'
import type { DomWidgetController } from '@xenolith/editor'

/** Props every React-component widget receives. `value` is the widget's stored value (node.state),
 *  `setValue` commits a change (undoable). `accent`/`text`/`muted` come from the active theme. */
export interface WidgetProps {
  value: unknown
  setValue: (v: unknown) => void
  accent: string
  text: string
  muted: string
  width: number
  height: number
}

/** Bridge a React component into a XenolithGraph custom widget. This is the heart of "bring your
 *  own UI": `editor.registerWidget('name', reactWidget(MyComponent))` renders `MyComponent` as the
 *  node's widget, with full React state/hooks/libraries available. */
export function reactWidget(Component: (props: WidgetProps) => ReactNode): DomWidgetController {
  let root: Root | null = null
  let setValue: (v: unknown) => void = () => {}
  const toProps = (c: { value: unknown; accent: string; text: string; muted: string; width: number; height: number }): WidgetProps =>
    ({ value: c.value, setValue, accent: c.accent, text: c.text, muted: c.muted, width: c.width, height: c.height })

  return {
    mount(el, c) {
      setValue = c.setValue
      root = createRoot(el)
      root.render(<Component {...toProps(c)} />)
      return () => { root?.unmount(); root = null }
    },
    update(c) { root?.render(<Component {...toProps(c)} />) },
  }
}
