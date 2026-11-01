import { useCallback, useEffect, useMemo, useState } from 'react'
import { audioControls, audioDetails, audioJobRequest, loadedAudioModel } from '@view'
import { describeError } from '@/services/admin-api'
import { list, record, rows, text } from '../types'
import type { RecordValue } from '../types'
import type { Workspace } from '../useWorkspace'

const PENDING = ['queued', 'generating']

/** The audio job under way, the clips made so far and the loaded model's form. */
export function useAudioStudio({ execute, snapshot }: Workspace) {
  const service = loadedAudioModel(snapshot)
  const model = service?.model
  const loaded = record(record(record(service?.details).model).loaded)
  const mode = text(loaded.mode, '')
  // The model's form is what the catalog said when it was downloaded.
  const details = audioDetails(snapshot?.setups, model)
  const controls = useMemo(() => audioControls(details), [details])
  const [draft, setDraft] = useState<RecordValue>({})
  const [voices, setVoices] = useState<string[]>([])
  const [job, setJob] = useState<RecordValue | null>(null)
  const [clips, setClips] = useState<RecordValue[]>([])
  const [error, setError] = useState('')
  const refresh = useCallback(async () => setClips(rows(await execute('audio.gallery'))), [execute])
  useEffect(() => {
    void refresh().catch((e) => setError(describeError(e)))
  }, [refresh])
  useEffect(() => {
    setDraft({})
    setVoices([])
    if (!model) return
    let live = true
    void execute('audio.capabilities')
      .then((value) => {
        if (live) setVoices(list(record(value).voices))
      })
      .catch((e) => {
        if (live) setError(describeError(e))
      })
    return () => {
      live = false
    }
  }, [execute, model])
  // A job another client or an earlier page started is followed the same way.
  const active = record(record(service?.details).activeJob)
  const running =
    job && PENDING.includes(text(job.state, '')) ? job : text(active.id, '') ? active : (job ?? {})
  const id = text(running.id, '')
  const pending = Boolean(id) && PENDING.includes(text(running.state, ''))
  useEffect(() => {
    if (!pending) return
    let live = true
    const timer = setInterval(() => {
      void execute('audio.job', { id })
        .then((value) => {
          if (!live) return
          const current = record(record(value).job)
          setJob(current)
          if (!PENDING.includes(text(current.state, ''))) return refresh()
        })
        .catch((e) => {
          if (live) setError(describeError(e))
        })
    }, 1500)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [execute, id, pending, refresh])
  const values: RecordValue = {
    ...Object.fromEntries(
      controls.flatMap((c) => (c.default === undefined ? [] : [[c.name, c.default] as const]))
    ),
    ...draft,
  }
  const generate = async () => {
    setError('')
    const request = audioJobRequest(values, controls)
    const created = record(await execute('audio.generate', { mode, request }))
    setJob(created)
    if (!PENDING.includes(text(created.state, ''))) await refresh()
  }
  const cancel = async () => {
    await execute('audio.cancel', { id })
    setJob(record(record(await execute('audio.job', { id })).job))
    await refresh()
  }
  const remove = async (clip: string) => {
    await execute('audio.delete', { id: clip })
    await refresh()
  }
  return {
    model,
    name: text(loaded.displayName, model ?? ''),
    mode,
    details,
    controls,
    voices,
    values,
    change: (name: string, value: unknown) => setDraft((current) => ({ ...current, [name]: value })),
    job: running,
    pending,
    clips,
    error,
    generate,
    cancel,
    remove,
  }
}
