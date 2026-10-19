import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
import { useChatSession } from './useChatSession'
import { useChatPreferences } from './chat-preferences'
import { ChatToolbar } from './ChatToolbar'
import { ChatHistory } from './ChatHistory'
import { ChatMessages } from './ChatMessages'
import { ChatParameters } from './ChatParameters'
import { ChatSettings } from './ChatSettings'
import { ChatModelPicker } from './ChatModelPicker'
import { ChatCapabilities } from './ChatCapabilities'
import { ChatAttachments } from './ChatAttachments'
import type { Attachment } from './ChatAttachments'
import { ChatTools } from './ChatTools'
import { workspaceApi } from '../workspace-api'

export function Chat({ workspace: w, onCatalog }: { workspace: Workspace; onCatalog: () => void }) {
  const s = useChatSession(),
    { preferences, save } = useChatPreferences()
  const [draft, setDraft] = useState(''),
    [system, setSystem] = useState(preferences.system)
  const [parameters, setParameters] = useState(preferences.parameters),
    [selected, setSelected] = useState('')
  const [settings, setSettings] = useState(false),
    [attachments, setAttachments] = useState<Attachment[]>([])
  const [capabilities, setCapabilities] = useState<RecordValue>({})
  const bottom = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null)
  const models = w.snapshot?.services.filter((m) => m.kind === 'chat') ?? []
  const service = models.find((m) => m.id === selected) ?? (!selected ? models[0] : undefined)
  const messages = rows(s.chat.messages),
    last = messages[messages.length - 1]
  const toolsPending = last?.role === 'assistant' && rows(last.tool_calls).length > 0
  const model = service?.model,
    provider = service?.provider
  useEffect(() => {
    let active = true
    setCapabilities({})
    if (model && provider)
      void workspaceApi
        .execute('models.info', { provider, model_id: model })
        .then((v) => {
          if (active) setCapabilities(record(v))
        })
        .catch(() => undefined)
    return () => {
      active = false
    }
  }, [model, provider])
  useEffect(() => {
    if (preferences.autoScroll) bottom.current?.scrollIntoView({ block: 'end' })
  }, [s.chat, preferences.autoScroll])
  useEffect(() => {
    const stored = rows(s.chat.messages).find((m) => m.role === 'system')
    setSystem(stored ? text(stored.content, '') : preferences.system)
    setParameters(
      s.chat.id ? JSON.stringify(record(s.chat.request_settings), null, 2) : preferences.parameters
    )
    setAttachments([])
    setDraft('')
    if (s.chat.model) {
      const match = models.find((m) => m.model === s.chat.model)
      setSelected(match?.id ?? 'unavailable')
    }
    // Switching conversations restores their prompt; edits to preferences affect new chats.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.chat.id, s.chat.draft_key])
  useEffect(() => {
    const fresh = () => {
      s.fresh()
      composer.current?.focus()
    }
    window.addEventListener('atomic:new-chat', fresh)
    return () => window.removeEventListener('atomic:new-chat', fresh)
  })
  const request = () => {
    let value: unknown
    try {
      value = JSON.parse(parameters)
    } catch {
      throw new Error(
        'Request JSON is invalid. Fix it under Additional engine parameters & tools; your message is kept.'
      )
    }
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Request JSON must be an object.')
    if (!service) throw new Error('Load and select a ready model in Engines & Models.')
    return { ...record(value), model: service.model }
  }
  const generate = async (next: RecordValue[], base = s.chat) => {
    const configured = request()
    const withSystem = system
      ? [{ role: 'system', content: system }, ...next.filter((m) => m.role !== 'system')]
      : next.filter((m) => m.role !== 'system')
    await s.generate(withSystem, configured, service!.provider, base)
  }
  const send = async () => {
    if (!draft.trim() && !attachments.length) return
    try {
      request() // Validate before clearing the composer.
      if (attachments.some((a) => a.image) && capabilities.vision !== true)
        throw new Error('Select a vision-capable model or remove the images.')
      const written = [
        draft,
        ...attachments
          .filter((a) => a.text !== undefined)
          .map((a) => `\nAttached file: ${a.name}\n${a.text}`),
      ]
        .filter(Boolean)
        .join('\n')
      const images = attachments.filter((a) => a.image)
      const content = images.length
        ? [
            { type: 'text', text: written },
            ...images.map((a) => ({ type: 'image_url', image_url: { url: a.image } })),
          ]
        : written
      await generate([...messages, { role: 'user', content }])
      // Retain input when request admission failed; accepted requests are in history.
      setDraft('')
      setAttachments([])
    } catch (e) {
      s.setError(e instanceof Error ? e.message : String(e))
    }
  }
  const branch = async (index: number, content?: string) => {
    const next = messages.slice(0, index + 1).map((m) => ({ ...m }))
    if (content !== undefined) next[index] = { ...next[index], content, atomic_meta: undefined }
    return s.save(
      { ...s.chat, title: `${text(s.chat.title, 'Conversation')} · branch`, messages: next, archived: false },
      true
    )
  }
  const regenerate = async (index: number) => {
    request()
    const next = messages.slice(0, index)
    const fork = await s.save(
      { ...s.chat, title: `${text(s.chat.title)} · alternative`, messages: next, archived: false },
      true
    )
    await generate(next, fork)
  }
  const usage = record(s.job.usage ?? record(last?.atomic_meta).usage)
  const isLight =
    preferences.theme === 'light' ||
    (preferences.theme === 'system' && window.matchMedia('(prefers-color-scheme: light)').matches)
  return (
    <div
      className={`chat-layout chat-enhanced ${preferences.sidebar ? '' : 'sidebar-hidden'} ${isLight ? 'chat-light' : ''}`}
      style={
        {
          '--chat-font-size': `${preferences.fontSize}px`,
          '--chat-code-height': `${preferences.codeHeight}px`,
        } as CSSProperties
      }
    >
      {preferences.sidebar && <ChatHistory session={s} />}
      <div className="chat-main">
        <ChatToolbar
          session={s}
          preferences={preferences}
          save={save}
          openSettings={() => setSettings(true)}
        />
        <div className="chat-scroll">
          {!messages.length && (
            <div className="chat-empty">
              <h1>Test your model</h1>
              <p>Send a test message here. Connect your agent from the Server page.</p>
              {!service && <Action onClick={onCatalog}>Load a model</Action>}
            </div>
          )}
          <ChatMessages
            messages={messages}
            preferences={preferences}
            busy={s.busy}
            edit={branch}
            fork={branch}
            regenerate={regenerate}
          />
          {s.busy && (
            <p role="status">
              {s.job.state === 'stopping'
                ? 'Stopping…'
                : s.job.state === 'generating'
                  ? 'Generating…'
                  : 'Waiting for the engine…'}{' '}
              {s.job.duration_ms ? `${(Number(s.job.duration_ms) / 1000).toFixed(1)}s` : ''}
            </p>
          )}
          {s.error && (
            <div className="ew-error" role="alert">
              {s.error}
              <div className="ew-actions">
                <Action onClick={onCatalog}>Engines & Models</Action>
                <Action onClick={() => window.location.reload()}>Reconnect</Action>
              </div>
            </div>
          )}
          {toolsPending && !s.busy && (
            <ChatTools
              key={JSON.stringify(last.tool_calls)}
              message={last}
              disabled={s.busy}
              submit={(results) => generate([...messages, ...results])}
            />
          )}
          {!s.busy && last?.role === 'user' && (
            <Action disabled={!service} onClick={() => generate(messages)}>
              Generate from here
            </Action>
          )}
          {!s.busy && last?.role === 'assistant' && !toolsPending && (
            <Action
              disabled={!service}
              onClick={() =>
                generate([
                  ...messages,
                  { role: 'user', content: 'Continue your previous answer from where you stopped.' },
                ])
              }
            >
              Continue answer
            </Action>
          )}
          <div ref={bottom} />
        </div>
        <ChatParameters
          system={system}
          setSystem={setSystem}
          parameters={parameters}
          setParameters={setParameters}
          preferences={preferences}
          save={save}
          disabled={s.busy}
          provider={provider ?? ''}
        />
        <div className="composer">
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
            {s.busy ? (
              <Action disabled={!s.job.id || s.job.state === 'stopping'} onClick={s.stop}>
                Stop response
              </Action>
            ) : (
              <button
                className="send-button"
                disabled={!service || toolsPending || (!draft.trim() && !attachments.length)}
                onClick={() => void send()}
              >
                Send ↑
              </button>
            )}
          </div>
          <div className="composer-controls">
            <ChatModelPicker
              models={models}
              selected={service?.id ?? selected}
              setSelected={setSelected}
              preferences={preferences}
              save={save}
              disabled={s.busy}
              onCatalog={onCatalog}
            />
          </div>
          <ChatAttachments
            attachments={attachments}
            setAttachments={setAttachments}
            disabled={s.busy}
            vision={capabilities.vision === true}
          />
          <ChatCapabilities usage={usage} capabilities={capabilities} />
        </div>
      </div>
      {settings && <ChatSettings value={preferences} save={save} onClose={() => setSettings(false)} />}
    </div>
  )
}
