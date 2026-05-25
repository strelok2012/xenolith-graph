import type { ReactNode } from 'react'
import { CodeBlock } from './CodeBlock.js'

/** The interactive region of a demo — just the editor; all controls/readouts now live INSIDE it as
 *  `<XenolithPanel>` overlays. THIS is what becomes an Astro island (`client:only`); it owns no page
 *  chrome (no title, no code block) so the docs site can render those with its own components. */
export function DemoStage(props: { children: ReactNode }) {
  return (
    <div className="demo-interactive">
      <div className="stage">
        <div className="editor-wrap">{props.children}</div>
      </div>
    </div>
  )
}

/** Standalone-app page chrome: title + blurb, the interactive island, and a highlighted snippet.
 *  On the docs site this wrapper is NOT used — only the island (children) is embedded, and the
 *  code is rendered by the site's own pipeline. */
export function DemoPage(props: {
  title: string
  blurb: string
  code?: string
  githubPath?: string
  children: ReactNode
}) {
  return (
    <div className="page">
      <header>
        <h1>{props.title}</h1>
        <p>{props.blurb}</p>
      </header>
      {props.children}
      {props.code && (props.githubPath
        ? <CodeBlock code={props.code} githubPath={props.githubPath} />
        : <CodeBlock code={props.code} />)}
    </div>
  )
}
