// Lifted from Atomic-Chat/web-app/src/containers/ChatInput.tsx @ 807b4d9; adapted: server conversation controls.
import { ArrowRight, Square } from 'lucide-react'
import type { Ref, ReactNode } from 'react'
import type { WorkspaceServiceRow } from '@contract'
import type { InferenceReadiness } from '@view'
import { Action } from '../Controls'
import type { RecordValue } from '../types'
import type { useChatSession } from './useChatSession'
import type { ChatPreferences } from './chat-preferences'
import { ChatModelPicker } from './ChatModelPicker'
import { ChatAttachments } from './ChatAttachments'
import type { Attachment } from './ChatAttachments'

export function ChatComposer({
  session: s,
  composer,
  draft,
  setDraft,
  toolsPending,
  send,
  service,
  models,
  selected,
  setSelected,
  preferences,
  save,
  onCatalog,
  attachments,
  setAttachments,
  capabilities,
  featureControls,
  readiness,
  acquire,
  modelRequest,
}: {
  session: ReturnType<typeof useChatSession>
  composer: Ref<HTMLTextAreaElement>
  draft: string
  setDraft: (value: string) => void
  toolsPending: boolean
  send: () => Promise<void>
  service: WorkspaceServiceRow | undefined
  models: WorkspaceServiceRow[]
  selected: string
  setSelected: (value: string) => void
  preferences: ChatPreferences
  save: (value: ChatPreferences) => void
  onCatalog: () => void
  attachments: Attachment[]
  setAttachments: (value: Attachment[]) => void
  capabilities: RecordValue
  usage: RecordValue
  featureControls?: ReactNode
  readiness?: InferenceReadiness
  acquire?: () => void
  modelRequest?: number
}) {
  return (
    <div className="composer">
      {readiness && !readiness.ready && (
        <div className="composer-readiness" role="status">
          {readiness.message}
          {readiness.acquire && readiness.acquire !== 'catalog' && (
            <button onClick={acquire}>
              {readiness.acquire === 'downloads'
                ? 'View downloads'
                : readiness.acquire === 'server'
                  ? 'Open server'
                  : 'Choose a model'}
            </button>
          )}
        </div>
      )}
      <div className="composer-input">
        <textarea
          ref={composer}
          aria-label="Message"
          placeholder={toolsPending ? 'Resolve the tool calls above to continue' : 'Message'}
          value={draft}
          disabled={s.busy || toolsPending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing &&
              (preferences.sendOnEnter || e.metaKey || e.ctrlKey)
            ) {
              e.preventDefault()
              void send()
            }
          }}
        />
      </div>
      <div className="composer-toolbar">
        <ChatAttachments
          attachments={attachments}
          setAttachments={setAttachments}
          disabled={s.busy}
          vision={capabilities.vision === true}
        />
        {featureControls}
        <div className="composer-controls">
          <ChatModelPicker
            openRequest={modelRequest}
            models={models}
            selected={service?.id ?? selected}
            setSelected={setSelected}
            preferences={preferences}
            save={save}
            disabled={s.busy}
            onCatalog={onCatalog}
          />
        </div>
        <div className="composer-send">
          {s.busy ? (
            <Action
              ariaLabel="Stop response"
              title="Stop response"
              disabled={!s.job.id || s.job.state === 'stopping'}
              onClick={s.stop}
            >
              <Square size={16} />
            </Action>
          ) : (
            <button
              className="send-button"
              aria-label="Send"
              title="Send message"
              disabled={toolsPending || (!draft.trim() && !attachments.length)}
              onClick={() => void send()}
            >
              <ArrowRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
