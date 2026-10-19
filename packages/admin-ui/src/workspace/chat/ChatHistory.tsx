import { useState } from 'react'
import { Action, Field } from '../Controls'
import { downloadJson } from './chat-preferences'
import { workspaceApi } from '../workspace-api'
import { text } from '../types'
import type { RecordValue } from '../types'
import type { useChatSession } from './useChatSession'
export function ChatHistory({ session: s }: { session: ReturnType<typeof useChatSession> }) {
  const [query, setQuery] = useState(''),
    [archived, setArchived] = useState(false)
  const [search, setSearch] = useState<RecordValue[] | null>(null)
  const source = search ?? s.recents
  const filtered = source.filter(
    (c) =>
      Boolean(c.archived) === archived &&
      (!query || search || text(c.title).toLowerCase().includes(query.toLowerCase()))
  )
  return (
    <aside className="recents">
      <button className="ew-button new-chat primary" disabled={s.busy} onClick={s.fresh}>
        ＋ New chat
      </button>
      <Field label="Search conversations">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setSearch(null)
          }}
        />
      </Field>
      <Action
        disabled={!query || s.busy}
        onClick={async () => {
          const found: RecordValue[] = []
          for (const item of s.recents) {
            const chat = await workspaceApi.execute<RecordValue>('history.load', { id: item.id })
            if (JSON.stringify([chat.title, chat.messages]).toLowerCase().includes(query.toLowerCase()))
              found.push(item)
          }
          setSearch(found)
        }}
      >
        Search message text
      </Action>
      <label className="preference-check">
        <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
        Archived
      </label>
      <h2>{search ? 'Search results' : archived ? 'Archived conversations' : 'Recent conversations'}</h2>
      {!filtered.length && <p className="ew-muted">No conversations here.</p>}
      {filtered.map((chat) => (
        <button
          key={text(chat.id)}
          className={`recent ${chat.id === s.chat.id ? 'active' : ''}`}
          title={text(chat.title)}
          disabled={s.busy}
          onClick={() => void s.open(text(chat.id)).catch((e) => s.setError(String(e)))}
        >
          {text(chat.title)}
        </button>
      ))}
      <details>
        <summary>Import / export</summary>
        <Action
          onClick={async () => {
            const conversations = await Promise.all(
              s.recents.map((c) => workspaceApi.execute('history.load', { id: c.id }))
            )
            downloadJson('atomic-conversations.json', { format: 'atomic-conversations-v1', conversations })
          }}
        >
          Export all conversations
        </Action>
        <Field label="Import conversations (JSON / JSONL)">
          <input
            type="file"
            accept=".json,.jsonl"
            disabled={s.busy}
            onChange={async (event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              try {
                if (file.size > 32 * 1024 * 1024) throw new Error('Choose a file smaller than 32 MB.')
                const raw = await file.text()
                let value: unknown
                try {
                  value = JSON.parse(raw)
                } catch {
                  value = raw
                    .split(/\r?\n/)
                    .filter((line) => line.trim())
                    .map((line) => JSON.parse(line))
                }
                const data = value as RecordValue
                let chats = Array.isArray(value)
                  ? value
                  : Array.isArray(data.conversations)
                    ? data.conversations
                    : [value]
                if (chats[0]?.role) chats = [{ title: file.name, messages: chats }]
                if (
                  !window.confirm(
                    `Import ${chats.length} conversation(s) as new copies? Existing chats will be kept.`
                  )
                )
                  return
                const result = await workspaceApi.execute<RecordValue>('history.import', {
                  conversations: chats,
                })
                await s.refresh()
                s.setError('')
                setSearch(null)
                setQuery('')
                if (Array.isArray(result.ids) && result.ids[0]) await s.open(String(result.ids[0]))
              } catch (e) {
                s.setError(e instanceof Error ? e.message : String(e))
              }
            }}
          />
        </Field>
        <small>
          Imports merge new copies. Embedded images and text are supported. Archive conversations to hide them
          without deleting them.
        </small>
      </details>
    </aside>
  )
}
