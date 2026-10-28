import { useCallback, useEffect, useRef, useState } from 'react'
import { workspaceApi } from '../workspace-api'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
import { describeError } from '@/services/admin-api'
import { conversationPrint, savedConversationChange } from '@view'
import { watchSharedRead } from '../watch-shared-read'

const ACTIVE = 'atomic:playground:active:v1'
const running = (state: unknown) => ['preparing', 'generating', 'stopping'].includes(String(state))
export function useChatSession() {
  const [chat, setChat] = useState<RecordValue>({ messages: [] })
  const [job, setJob] = useState<RecordValue>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [recents, setRecents] = useState<RecordValue[]>([])
  const live = useRef(true),
    locked = useRef(false),
    // Each conversation as this page last saved or loaded it, and a count of its saves: a read that
    // started before a save is older than what the page shows.
    synced = useRef(new Map<string, string>()),
    saves = useRef(0)
  const mark = (value: RecordValue) => synced.current.set(text(value.id), conversationPrint(value))
  const refresh = useCallback(async () => setRecents(rows(await workspaceApi.execute('history.list'))), [])
  const open = async (id: string) => {
    if (locked.current) return
    const result = record(await workspaceApi.execute('history.load', { id }))
    if (!result.id) throw new Error('This conversation is no longer available.')
    mark(result)
    setChat(result)
    setJob({})
    setError('')
  }
  const watch = async (initial: RecordValue, conversation: RecordValue) => {
    let current = initial
    while (live.current) {
      setJob(current)
      const shown = {
        ...conversation,
        id: current.conversation_id,
        model: current.model,
        messages: [...rows(conversation.messages), record(current.message)],
      }
      setChat(shown)
      if (!running(current.state)) {
        localStorage.removeItem(ACTIVE)
        if (current.error) setError(text(current.error))
        const saved = record(await workspaceApi.execute('history.load', { id: current.conversation_id }))
        // Keep the visible reply if the disk save failed; it is what later changes are compared with.
        if (saved.id && !current.error) {
          mark(saved)
          setChat(saved)
        } else if (saved.id) mark(shown)
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
    let active: string | null = null
    try {
      active = localStorage.getItem(ACTIVE)
    } catch {
      /* storage blocked: nothing to recover */
    }
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
  // Another client's chats, turns, renames and deletions (the terminal writes the same history).
  useEffect(() => {
    let first = true
    return watchSharedRead(
      () => workspaceApi.execute('history.list'),
      (value) => {
        first = false
        setRecents(rows(value))
      },
      // Only the first read says the history is unavailable; a later one keeps the list shown.
      (e) => {
        if (first) setError(describeError(e))
        first = false
      }
    )
  }, [])
  const openId = typeof chat.id === 'string' ? chat.id : ''
  useEffect(() => {
    if (!openId || busy) return
    let at = saves.current
    return watchSharedRead(
      async () => {
        at = saves.current
        return record(await workspaceApi.execute('history.load', { id: openId }))
      },
      (saved) => {
        if (at !== saves.current || locked.current) return
        setChat((shown) => {
          if (shown.id !== openId) return shown
          const change = savedConversationChange(shown, saved, synced.current.get(openId))
          if (change === 'adopt') {
            mark(saved)
            return saved
          }
          if (change !== 'deleted') return shown
          synced.current.delete(openId)
          // The same draft key keeps what was typed for the deleted chat.
          return { messages: [], draft_key: openId }
        })
      },
      () => {}
    )
  }, [openId, busy])
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
    saves.current++
    await workspaceApi.execute('history.save', { chat: value })
    mark(value)
    setChat(value)
    await refresh()
    return value
  }
  const generate = async (
    messages: RecordValue[],
    request: RecordValue,
    provider: string,
    base = chat,
    onStarted?: () => void
  ) => {
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
      onStarted?.()
      try {
        localStorage.setItem(ACTIVE, text(progress.id))
      } catch {
        /* storage blocked: the job is still followed in memory */
      }
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
  const startSkill = useCallback((name: string) => {
    if (locked.current) return
    setChat({ messages: [], draft_key: crypto.randomUUID(), request_settings: { atomic_skills: [name] } })
    setJob({})
    setError('')
  }, [])
  return {
    chat,
    job,
    busy,
    error,
    setError,
    recents,
    open,
    save,
    generate,
    stop,
    fresh,
    startSkill,
    refresh,
  }
}
