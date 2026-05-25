import type { ReactElement, ReactNode } from 'react'

// Minimal inline Feather icons (https://feathericons.com, MIT). Stroke = currentColor, so each icon
// inherits the button's text colour and tracks the theme.
function Icon({ children }: { children: ReactNode }): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export const IconZoomIn = (): ReactElement => (
  <Icon><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></Icon>
)
export const IconZoomOut = (): ReactElement => (
  <Icon><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></Icon>
)
export const IconFit = (): ReactElement => (
  <Icon><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" /></Icon>
)
export const IconReset = (): ReactElement => (
  <Icon><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></Icon>
)
export const IconUndo = (): ReactElement => (
  <Icon><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></Icon>
)
export const IconRedo = (): ReactElement => (
  <Icon><polyline points="15 14 20 9 15 4" /><path d="M4 20v-7a4 4 0 0 1 4-4h12" /></Icon>
)
