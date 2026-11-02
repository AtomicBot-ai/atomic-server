import { useEffect, useState } from 'react'
import { loadedAudioModel } from '@view'
import { describeError } from '@/services/admin-api'
import { list, record, rows, text } from '../types'
import type { RecordValue } from '../types'
import type { Workspace } from '../useWorkspace'

/** Capabilities survive a stopped engine; MODEL_NOT_LOADED confirms an explicit unload. */
export function useAudioSelection({ execute, snapshot }: Workspace) {
  const service = loadedAudioModel(snapshot)
  const loaded = record(record(record(service?.details).model).loaded)
  const residentId = service?.model
  const residentName = text(loaded.displayName, '')
  const residentMode = text(loaded.mode, '')
  const [retained, setRetained] = useState<RecordValue | null>(() =>
    service ? { ...loaded, modelId: service.model } : null
  )
  const [error, setError] = useState('')
  // With no resident model, each fresh snapshot checks whether the core still keeps a selection.
  const revision = residentId ? undefined : snapshot?.captured_at
  useEffect(() => {
    let live = true
    const selected = { displayName: residentName, mode: residentMode }
    if (residentId)
      setRetained((previous) => ({
        ...(previous?.modelId === residentId ? previous : {}),
        ...selected,
        modelId: residentId,
      }))
    void execute('audio.capabilities')
      .then((value) => {
        if (!live) return
        const capabilities = record(value)
        const modelId = text(capabilities.modelId, residentId ?? '')
        setRetained((previous) =>
          modelId
            ? {
                ...(previous?.modelId === modelId ? previous : {}),
                ...(residentId === modelId ? selected : {}),
                ...capabilities,
                modelId,
              }
            : null
        )
        setError('')
      })
      .catch((e: unknown) => {
        if (!live) return
        if (record(e).code === 'MODEL_NOT_LOADED') {
          setRetained(null)
          setError('')
        } else setError(describeError(e))
      })
    return () => {
      live = false
    }
  }, [execute, residentId, residentName, residentMode, revision])
  const selected = service
    ? { ...(retained?.modelId === residentId ? retained : {}), ...loaded, modelId: residentId }
    : retained
  const model = text(selected?.modelId, '') || undefined
  const plan = rows(snapshot?.setups)
    .map((job) => record(job.plan))
    .find((p) => p.model_id === model)
  return {
    model,
    name: text(selected?.displayName, text(plan?.name, model ?? '')),
    mode: text(selected?.mode, ''),
    voices: list(selected?.voices),
    error,
    loading:
      snapshot?.services.some((s) => s.kind === 'audio' && ['loading', 'unloading'].includes(s.state)) ??
      false,
  }
}
