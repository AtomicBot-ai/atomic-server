import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { highlightDownloads } from '../library/download-attention'
import { createPortal } from 'react-dom'
import type { Workspace } from '../useWorkspace'
import { connectorToolBindings, inferenceReadiness } from '@view'
import { openAcquisition } from '../useAcquisition'
import { chatRequest } from './chat-request'
import { ChatFeaturePicker } from './ChatFeaturePicker'
import type { ChatFeatureSelection } from './ChatFeaturePicker'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
import { useChatSession } from './useChatSession'
import { useChatPreferences } from './chat-preferences'
import { ChatToolbar } from './ChatToolbar'
import { ChatHistory } from './ChatHistory'
import { ChatMessages } from './ChatMessages'
import { ChatParameters } from './ChatParameters'
import { ChatSettings } from './ChatSettings'
import { ChatComposer } from './ChatComposer'
import type { Attachment } from './ChatAttachments'
import { ChatTurnStatus } from './ChatTurnStatus'
import { workspaceApi } from '../workspace-api'
import { ChatEmpty } from './ChatEmpty'
import './chat-sidebar.css'
import './chat-desktop.css'
import './chat-composition.css'
export function Chat({
  workspace: w,
  onCatalog,
  historyContainer,
  trySkill,
  onSkillStarted,
}: {
  workspace: Workspace
  onCatalog: () => void
  historyContainer?: HTMLElement | null
  trySkill?: string | null
  onSkillStarted?: () => void
}) {
  const s = useChatSession(),
    { preferences, save } = useChatPreferences()
  const [draft, setDraft] = useState(''),
    [system, setSystem] = useState(preferences.system)
  const [parameters, setParameters] = useState(preferences.parameters),
    [selected, setSelected] = useState('')
  const [settings, setSettings] = useState(false),
    [attachments, setAttachments] = useState<Attachment[]>([])
  const [features, setFeatures] = useState<ChatFeatureSelection>({
    assistant: '',
    skills: [],
    connectors: [],
  })
  const bindings = connectorToolBindings(w.snapshot?.features, features.connectors)
  const [capabilities, setCapabilities] = useState<RecordValue>({})
  const [admission, setAdmission] = useState({ attempted: false, modelRequest: 0 })
  const bottom = useRef<HTMLDivElement>(null),
    composer = useRef<HTMLTextAreaElement>(null)
  const models = w.snapshot?.services.filter((m) => m.kind === 'chat') ?? []
  const service = models.find((m) => m.id === selected) ?? (!selected ? models[0] : undefined)
  const readiness = inferenceReadiness(w.snapshot, {
    model: service?.model,
    provider: service?.provider,
    kind: 'chat',
    requireApi: true,
  })
  const messages = rows(s.chat.messages),
    last = messages[messages.length - 1]
  const toolsPending = last?.role === 'assistant' && rows(last.tool_calls).length > 0
  const { busy, startSkill } = s
  useEffect(() => {
    if (!trySkill || busy) return
    startSkill(trySkill)
    onSkillStarted?.()
  }, [trySkill, onSkillStarted, busy, startSkill])
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
    if (preferences.autoScroll || s.error) bottom.current?.scrollIntoView({ block: 'end' })
  }, [s.chat, s.error, preferences.autoScroll])
  useEffect(() => {
    const stored = rows(s.chat.messages).find((m) => m.role === 'system')
    setSystem(stored ? text(stored.content, '') : preferences.system)
    setParameters(
      s.chat.id ? JSON.stringify(record(s.chat.request_settings), null, 2) : preferences.parameters
    )
    const storedFeatures = record(s.chat.request_settings)
    setFeatures({
      assistant: text(storedFeatures.atomic_assistant, ''),
      skills: Array.isArray(storedFeatures.atomic_skills) ? storedFeatures.atomic_skills.map(String) : [],
      connectors: Array.isArray(storedFeatures.atomic_connectors)
        ? storedFeatures.atomic_connectors.map(String)
        : [],
    })
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
      if (s.busy) return
      s.fresh()
      composer.current?.focus()
    }
    window.addEventListener('atomic:new-chat', fresh)
    return () => window.removeEventListener('atomic:new-chat', fresh)
  })
  const request = () => chatRequest(parameters, service, features, bindings)
  const generate = async (next: RecordValue[], base = s.chat) => {
    if (!readiness.ready) throw new Error(readiness.message)
    const configured = request()
    const withSystem = system
      ? [{ role: 'system', content: system }, ...next.filter((m) => m.role !== 'system')]
      : next.filter((m) => m.role !== 'system')
    await s.generate(withSystem, configured, service!.provider, base)
  }
  const send = async () => {
    if (!draft.trim() && !attachments.length) return
    if (!readiness.ready) {
      if (readiness.waiting) highlightDownloads()
      s.setError('')
      setAdmission((v) => ({
        attempted: true,
        modelRequest: v.modelRequest + Number(readiness.acquire === 'catalog'),
      }))
      return
    }
    setAdmission((v) => ({ ...v, attempted: false }))
    try {
      request()
      if (attachments.some((a) => a.image) && capabilities.vision !== true)
        throw new Error('Select a vision-capable model or remove the images.')
      const written = [
        draft,
        ...(await Promise.all(
          attachments
            .filter((a) => a.text !== undefined)
            .map(async (a) => {
              const prepared = await w.execute<{ content: string }>('attachments.prepare', {
                name: a.name,
                content: a.text,
                query: draft,
              })
              return `\nAttached file: ${a.name}\n${prepared.content}`
            })
        )),
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
    if (!readiness.ready) throw new Error(readiness.message)
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
  const history = (
    <div className="chat-history-region" hidden={!preferences.sidebar}>
      <ChatHistory session={s} embedded={Boolean(historyContainer)} />
    </div>
  )
  return (
    <div
      className={`chat-layout chat-enhanced ${messages.length ? 'has-messages' : 'is-empty'} ${historyContainer ? 'history-in-sidebar' : ''} ${preferences.sidebar ? '' : 'sidebar-hidden'} ${isLight ? 'chat-light' : ''}`}
      style={
        {
          '--chat-font-size': `${preferences.fontSize}px`,
          '--chat-code-height': `${preferences.codeHeight}px`,
        } as CSSProperties
      }
    >
      {historyContainer ? createPortal(history, historyContainer) : history}
      <div className="chat-main">
        <ChatToolbar
          embeddedHistory={Boolean(historyContainer)}
          session={s}
          preferences={preferences}
          save={save}
          openSettings={() => setSettings(true)}
          requestControls={
            <ChatParameters
              system={system}
              setSystem={setSystem}
              parameters={parameters}
              setParameters={setParameters}
              preferences={preferences}
              save={save}
              disabled={s.busy}
              provider={provider ?? ''}
              capabilities={capabilities}
              usage={usage}
            />
          }
        />
        <div className="chat-scroll">
          {!messages.length && <ChatEmpty />}
          <ChatMessages
            messages={messages}
            preferences={preferences}
            busy={s.busy}
            edit={branch}
            fork={branch}
            regenerate={regenerate}
          />
          <ChatTurnStatus
            session={s}
            messages={messages}
            bindings={bindings}
            serviceReady={readiness.ready}
            generate={generate}
            onCatalog={onCatalog}
          />
          <div ref={bottom} />
        </div>
        <ChatComposer
          readiness={admission.attempted ? readiness : undefined}
          modelRequest={admission.modelRequest}
          acquire={() => openAcquisition(readiness.acquire)}
          session={s}
          composer={composer}
          draft={draft}
          setDraft={setDraft}
          toolsPending={toolsPending}
          send={send}
          service={service}
          models={models}
          selected={selected}
          setSelected={setSelected}
          preferences={preferences}
          save={save}
          onCatalog={onCatalog}
          attachments={attachments}
          setAttachments={setAttachments}
          capabilities={capabilities}
          usage={usage}
          featureControls={
            <ChatFeaturePicker
              features={w.snapshot?.features}
              value={features}
              onChange={setFeatures}
              disabled={s.busy}
            />
          }
        />
      </div>
      {settings && <ChatSettings value={preferences} save={save} onClose={() => setSettings(false)} />}
    </div>
  )
}
