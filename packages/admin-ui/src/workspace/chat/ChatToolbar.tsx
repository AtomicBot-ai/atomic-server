import { Action } from '../Controls'
import { text } from '../types'
import { downloadJson } from './chat-preferences'
import type { ChatPreferences } from './chat-preferences'
import type { useChatSession } from './useChatSession'
export function ChatToolbar({
  session: s,
  preferences,
  save,
  openSettings,
}: {
  session: ReturnType<typeof useChatSession>
  preferences: ChatPreferences
  save: (v: ChatPreferences) => void
  openSettings: () => void
}) {
  return (
    <>
      <div className="chat-toolbar ew-actions">
        <Action onClick={() => save({ ...preferences, sidebar: !preferences.sidebar })}>
          {preferences.sidebar ? 'Hide history' : 'Show history'}
        </Action>
        <Action disabled={s.busy} onClick={s.fresh}>
          New chat
        </Action>
        <Action onClick={openSettings}>Preferences</Action>
        {Boolean(s.chat.id) && (
          <details>
            <summary>Conversation actions</summary>
            <div className="ew-actions">
              <Action
                disabled={s.busy}
                onClick={async () => {
                  const title = window.prompt('Conversation title', text(s.chat.title))
                  if (title?.trim()) await s.save({ ...s.chat, title: title.trim().slice(0, 200) })
                }}
              >
                Rename
              </Action>
              <Action
                onClick={() =>
                  downloadJson('atomic-conversation.json', {
                    format: 'atomic-conversations-v1',
                    conversations: [s.chat],
                  })
                }
              >
                Export conversation
              </Action>
              <Action disabled={s.busy} onClick={() => s.save({ ...s.chat, archived: !s.chat.archived })}>
                {s.chat.archived ? 'Restore conversation' : 'Archive conversation'}
              </Action>
            </div>
          </details>
        )}
      </div>
      {s.tabs.length > 0 && (
        <nav className="conversation-tabs" aria-label="Open conversations">
          {s.tabs.map((tab) => (
            <div key={text(tab.id)}>
              <button
                className={tab.id === s.chat.id ? 'active' : ''}
                disabled={s.busy}
                onClick={() => void s.open(text(tab.id)).catch((e) => s.setError(String(e)))}
              >
                {text(tab.title)}
              </button>
              <button
                aria-label={`Close tab ${text(tab.title)}`}
                disabled={s.busy}
                onClick={() => s.setTabs(s.tabs.filter((t) => t.id !== tab.id))}
              >
                ×
              </button>
            </div>
          ))}
        </nav>
      )}
    </>
  )
}
