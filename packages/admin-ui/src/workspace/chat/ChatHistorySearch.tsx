import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Search, X } from 'lucide-react'
import { useDialog } from '../useDialog'
import { Action } from '../Controls'
import type { RecordValue } from '../types'
import { text } from '../types'
import { workspaceApi } from '../workspace-api'

export function ChatHistorySearch({
  recents,
  query,
  setQuery,
  open,
  close,
}: {
  recents: RecordValue[]
  query: string
  setQuery: (value: string) => void
  open: (id: string) => Promise<unknown>
  close: () => void
}) {
  const dialog = useDialog(close)
  const input = useRef<HTMLInputElement>(null)
  const queryRevision = useRef(0)
  useEffect(() => {
    input.current?.focus()
  }, [])
  const [matches, setMatches] = useState<RecordValue[] | null>(null)
  const [error, setError] = useState('')
  const visible =
    matches ?? recents.filter((item) => text(item.title).toLowerCase().includes(query.toLowerCase()))
  return createPortal(
    <div className="modal-shade">
      <section
        ref={dialog}
        className="ew-modal chat-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Search conversations"
        tabIndex={-1}
      >
        <div className="chat-search-heading">
          <Search size={18} />
          <input
            ref={input}
            aria-label="Search conversations"
            placeholder="Search conversations"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setMatches(null)
              queryRevision.current++
            }}
          />
          <button className="chat-icon-button" aria-label="Close conversation search" onClick={close}>
            <X size={18} />
          </button>
        </div>
        <Action
          disabled={!query.trim()}
          onClick={async () => {
            const revision = queryRevision.current
            const found: RecordValue[] = []
            for (const item of recents) {
              const chat = await workspaceApi.execute<RecordValue>('history.load', { id: item.id })
              if (JSON.stringify([chat.title, chat.messages]).toLowerCase().includes(query.toLowerCase()))
                found.push(item)
            }
            if (revision === queryRevision.current) setMatches(found)
          }}
        >
          Search message text
        </Action>
        <div className="chat-search-results">
          {visible.map((item) => (
            <button
              key={text(item.id)}
              className="recent"
              onClick={() =>
                void open(text(item.id))
                  .then(close)
                  .catch((e) => setError(String(e)))
              }
            >
              {text(item.title)}
            </button>
          ))}
          {!visible.length && <p className="ew-muted">No conversations found.</p>}
        </div>
        {error && <p role="alert">{error}</p>}
      </section>
    </div>,
    document.querySelector('.desktop-workspace') ?? document.body
  )
}
