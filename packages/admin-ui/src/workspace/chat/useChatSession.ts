import { useCallback, useEffect, useRef, useState } from 'react'
import { workspaceApi } from '../workspace-api'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
import { describeError } from '@/services/admin-api'

const ACTIVE = 'atomic:playground:active:v1'
const running = (state: unknown) => ['preparing', 'generating', 'stopping'].includes(String(state))
export function useChatSession() {
  const [chat, setChat] = useState<RecordValue>({ messages: [] })
  const [job, setJob] = useState<RecordValue>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recents, setRecents] = useState<RecordValue[]>([])
  const [tabs, setTabs] = useState<RecordValue[]>([])
  const live = useRef(true),
    locked = useRef(false)
  const refresh = useCallback(async () => setRecents(rows(await workspaceApi.execute('history.list'))), [])
  const remember = (value: RecordValue) =>
    setTabs((items) => [...items.filter((x) => x.id !== value.id), value].slice(-8))
  const open = async (id: string) => {
    if (locked.current) return
    const result = record(await workspaceApi.execute('history.load', { id }))
    if (!result.id) throw new Error('This conversation is no longer available.')
    setChat(result)
    setJob({})
    setError('')
    remember(result)
  }
  const watch = async (initial: RecordValue, conversation: RecordValue) => {
    let current = initial
    while (live.current) {
      setJob(current)
      setChat({
        ...conversation,
        id: current.conversation_id,
        model: current.model,
        messages: [...rows(conversation.messages), record(current.message)],
      })
      if (!running(current.state)) {
        localStorage.removeItem(ACTIVE)
        if (current.error) setError(text(current.error))
        const saved = record(await workspaceApi.execute('history.load', { id: current.conversation_id }))
        // Keep the visible reply if the disk save failed.
        if (saved.id && !current.error) {
          setChat(saved)
          remember(saved)
        }
        await refresh()
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
      if (!live.current) return
      current = record(await workspaceApi.execute('chat.progress', { id: current.id }))
    }
  }
  useEffect(() => {
    live.current = true
    void refresh().catch((e) => setError(describeError(e)))
    const active = localStorage.getItem(ACTIVE)
    if (active && !locked.current) {
      locked.current = true
      setBusy(true)
      void (async () => {
        const progress = record(await workspaceApi.execute('chat.progress', { id: active }))
        const saved = record(await workspaceApi.execute('history.load', { id: progress.conversation_id }))
        // While active, saved history contains the submitted request; final history includes its answer.
        const base = {
          ...saved,
          messages: running(progress.state) ? rows(saved.messages) : rows(saved.messages).slice(0, -1),
        }
        await watch(progress, base)
      })()
        .catch((e) => {
          localStorage.removeItem(ACTIVE)
          setError(describeError(e))
        })
        .finally(() => {
          locked.current = false
          if (live.current) setBusy(false)
        })
    }
    return () => {
      live.current = false
    }
    // One recovery per mount; watch uses server state and does not capture the selected conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh])
  const save = async (next: RecordValue, fork = false) => {
    const now = Date.now(),
      value = {
        endpoint: '',
        workingDirectory: '',
        model: '',
        createdAt: now,
        updatedAt: now,
        interrupted: false,
        title: 'New chat',
        ...next,
        id: fork || !next.id ? crypto.randomUUID() : next.id,
      }
    await workspaceApi.execute('history.save', { chat: value })
    setChat(value)
    remember(value)
    await refresh()
    return value
  }
  const generate = async (messages: RecordValue[], request: RecordValue, provider: string, base = chat) => {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError('')
    setJob({ state: 'preparing' })
    let started = false
    try {
      const wireMessages = messages.map((message) =>
        Object.fromEntries(Object.entries(message).filter(([key]) => key !== 'atomic_meta'))
      )
      const progress = record(
        await workspaceApi.execute('chat.start', {
          request: { ...request, messages: wireMessages },
          provider,
          ...(base.id ? { conversation_id: base.id } : {}),
        })
      )
      started = true
      localStorage.setItem(ACTIVE, text(progress.id))
      const parameters = Object.fromEntries(
        Object.entries(request).filter(([key]) => !['model', 'stream', 'stream_options'].includes(key))
      )
      await watch(progress, { ...base, messages, request_settings: parameters })
    } catch (e) {
      setError(describeError(e))
      if (!started) {
        setJob({})
        throw e
      }
    } finally {
      locked.current = false
      if (live.current) setBusy(false)
    }
  }
  const stop = async () => {
    if (!job.id) return
    const next = record(await workspaceApi.execute('chat.cancel', { id: job.id }))
    setJob(next)
  }
  const fresh = () => {
    if (!locked.current) {
      setChat({ messages: [], draft_key: crypto.randomUUID() })
      setJob({})
      setError('')
    }
  }
  return {
    chat,
    job,
    busy,
    error,
    setError,
    recents,
    tabs,
    setTabs,
    open,
    save,
    generate,
    stop,
    fresh,
    refresh,
  }
}
