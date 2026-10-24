import { useEffect, useRef, useState } from 'react'
import { ChevronDown, MessageCircle, Search } from 'lucide-react'
import { Action, Field } from '../Controls'
import { downloadJson } from './chat-preferences'
import { workspaceApi } from '../workspace-api'
import { text } from '../types'
import { ImportConversationsDialog } from './ImportConversationsDialog'
import type { RecordValue } from '../types'
import type { useChatSession } from './useChatSession'
import { ChatMenu } from './ChatMenu'
import { ChatHistorySearch } from './ChatHistorySearch'
export function ChatHistory({
  session: s,
  embedded = false,
}: {
  session: ReturnType<typeof useChatSession>
  embedded?: boolean
}) {
  const [query, setQuery] = useState(''),
    [archived, setArchived] = useState(false)
  const [searching, setSearching] = useState(false),
    [expanded, setExpanded] = useState(true)
  const [importing, setImporting] = useState<unknown[] | null>(null)
  const [reading, setReading] = useState(false)
  const importInput = useRef<HTMLInputElement>(null)
  const restoreImportFocus = useRef(false)
  useEffect(() => {
    const search = () => setSearching(true)
    window.addEventListener('atomic:search-chats', search)
    return () => window.removeEventListener('atomic:search-chats', search)
  }, [])
  useEffect(() => {
    if (!importing && restoreImportFocus.current) {
      restoreImportFocus.current = false
      importInput.current?.focus()
    }
  }, [importing])
  const filtered = s.recents.filter((c) => Boolean(c.archived) === archived)
  return (
    <aside className="recents">
      {!embedded && (
        <button className="new-chat" disabled={s.busy} onClick={s.fresh}>
          <MessageCircle size={17} />
          New chat
        </button>
      )}
      <div className="chat-recents-heading">
        <button
          className="chat-recents-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronDown size={14} />
          {archived ? 'Archived' : 'Recents'}
        </button>
        {!embedded && (
          <button
            className="chat-icon-button"
            aria-label="Search conversations"
            onClick={() => setSearching(true)}
          >
            <Search size={16} />
          </button>
        )}
        <ChatMenu label="History options">
          <label className="preference-check">
            <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
            Archived
          </label>
          <Action onClick={() => setSearching(true)}>Search conversations</Action>
          <details>
            <summary>Import / export</summary>
            <Action
              onClick={async () => {
                const conversations = await Promise.all(
                  s.recents.map((c) => workspaceApi.execute('history.load', { id: c.id }))
                )
                downloadJson('atomic-conversations.json', {
                  format: 'atomic-conversations-v1',
                  conversations,
                })
              }}
            >
              Export all conversations
            </Action>
            <Field label="Import conversations (JSON / JSONL)">
              <input
                ref={importInput}
                type="file"
                accept=".json,.jsonl"
                disabled={s.busy || reading || Boolean(importing)}
                onChange={async (event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (!file) return
                  setReading(true)
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
                    if (!chats.length) throw new Error('This file contains no conversations.')
                    s.setError('')
                    setImporting(chats)
                  } catch (e) {
                    s.setError(e instanceof Error ? e.message : String(e))
                  } finally {
                    setReading(false)
                  }
                }}
              />
            </Field>
          </details>
        </ChatMenu>
      </div>
      {expanded &&
        filtered.map((chat) => (
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
      {searching && (
        <ChatHistorySearch
          recents={s.recents}
          query={query}
          setQuery={setQuery}
          open={s.open}
          close={() => setSearching(false)}
        />
      )}
      {importing && (
        <ImportConversationsDialog
          conversations={importing}
          onClose={() => {
            restoreImportFocus.current = true
            setImporting(null)
          }}
          onImported={async (result) => {
            await s.refresh()
            if (Array.isArray(result.ids) && result.ids[0]) await s.open(String(result.ids[0]))
            s.setError('')
            setQuery('')
          }}
        />
      )}
    </aside>
  )
}
