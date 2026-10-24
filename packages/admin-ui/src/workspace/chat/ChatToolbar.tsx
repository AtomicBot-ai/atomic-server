import { useState, type ReactNode } from 'react'
import { Action } from '../Controls'
import { text } from '../types'
import { downloadJson } from './chat-preferences'
import { RenameConversationDialog } from './RenameConversationDialog'
import type { ChatPreferences } from './chat-preferences'
import type { useChatSession } from './useChatSession'
import { ChatMenu } from './ChatMenu'
export function ChatToolbar({
  session: s,
  preferences,
  save,
  openSettings,
  requestControls,
  embeddedHistory = false,
}: {
  session: ReturnType<typeof useChatSession>
  preferences: ChatPreferences
  save: (v: ChatPreferences) => void
  openSettings: () => void
  requestControls?: ReactNode
  embeddedHistory?: boolean
}) {
  const [renaming, setRenaming] = useState(false)
  return (
    <>
      <div className="chat-toolbar">
        {Boolean(s.chat.id) && <span className="chat-conversation-title">{text(s.chat.title)}</span>}
        {!preferences.sidebar && !embeddedHistory && (
          <Action disabled={s.busy} onClick={s.fresh}>
            New chat
          </Action>
        )}
        <div className="chat-toolbar-trailing">
          <ChatMenu label={s.chat.id ? 'Conversation actions' : 'Chat options'}>
            <Action onClick={() => save({ ...preferences, sidebar: !preferences.sidebar })}>
              {preferences.sidebar ? 'Hide history' : 'History'}
            </Action>
            <Action onClick={openSettings}>Preferences</Action>
            {Boolean(s.chat.id) && (
              <>
                <Action disabled={s.busy} onClick={() => setRenaming(true)}>
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
              </>
            )}
          </ChatMenu>
          {requestControls}
        </div>
      </div>
      {renaming && (
        <RenameConversationDialog
          title={text(s.chat.title)}
          onClose={() => setRenaming(false)}
          onSave={(title) => s.save({ ...s.chat, title })}
        />
      )}
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
