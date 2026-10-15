import type { ReactNode } from 'react'
import { Copy } from '../Controls'

/** A small, inert Markdown renderer. Raw HTML and executable links are always plain text. */
function inline(value: string): ReactNode[] {
  return value.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    const match = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part)
    if (match)
      return (
        <a key={i} href={match[2]} target="_blank" rel="noreferrer noopener">
          {match[1]}
        </a>
      )
    return part
  })
}
export function MarkdownMessage({ content }: { content: string }) {
  const parts = content.split(/```([^\n]*)\n([\s\S]*?)(?:```|$)/g)
  return (
    <div className="message-markdown">
      {parts.map((part, i) => {
        if (i % 3 === 1) return null
        if (i % 3 === 2)
          return (
            <div className="message-code" key={i}>
              <div className="panel-heading">
                <small>{parts[i - 1] || 'Code'}</small>
                <Copy value={part} label="Copy code" />
              </div>
              <pre>
                <code>{part}</code>
              </pre>
            </div>
          )
        return part.split('\n').map((line, j) => {
          const heading = /^(#{1,6})\s+(.*)$/.exec(line)
          if (heading)
            return (
              <div
                role="heading"
                aria-level={heading[1].length}
                className="markdown-heading"
                key={`${i}-${j}`}
              >
                {inline(heading[2])}
              </div>
            )
          if (/^[-*+]\s/.test(line))
            return (
              <div className="markdown-list" key={`${i}-${j}`}>
                • {inline(line.slice(2))}
              </div>
            )
          if (/^\d+[.)]\s/.test(line))
            return (
              <div className="markdown-list" key={`${i}-${j}`}>
                {inline(line)}
              </div>
            )
          if (line.startsWith('> ')) return <blockquote key={`${i}-${j}`}>{inline(line.slice(2))}</blockquote>
          return (
            <div className="markdown-line" key={`${i}-${j}`}>
              {inline(line) || <br />}
            </div>
          )
        })
      })}
    </div>
  )
}
