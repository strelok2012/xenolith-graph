import { useEffect, useState } from 'react'
import { codeToHtml } from 'shiki'
import { ghUrl } from './github.js'

/** Syntax-highlighted (Shiki) code with a copy button and an optional "View on GitHub" link. */
export function CodeBlock(props: { code: string; lang?: string; githubPath?: string }) {
  const lang = props.lang ?? 'tsx'
  const source = props.code.trim()
  const [html, setHtml] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let live = true
    void codeToHtml(source, { lang, theme: 'github-dark' }).then((h) => { if (live) setHtml(h) })
    return () => { live = false }
  }, [source, lang])

  return (
    <div className="codeblock">
      <div className="codeblock-bar">
        <span className="codeblock-lang">{lang}</span>
        <span className="codeblock-actions">
          <button onClick={() => { void navigator.clipboard.writeText(source); setCopied(true); setTimeout(() => setCopied(false), 1200) }}>
            {copied ? 'Copied ✓' : 'Copy'}
          </button>
          {props.githubPath && (
            <a href={ghUrl(props.githubPath)} target="_blank" rel="noreferrer">View on GitHub ↗</a>
          )}
        </span>
      </div>
      <div className="codeblock-body" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}
