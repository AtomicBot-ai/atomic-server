import { useEffect, useRef, useState } from 'react'
import { connectionDownload, connectionDownloadTarget, connectionModelState } from '@view'
import { describeError } from '@/services/admin-api'
import { record, rows, text, type RecordValue } from '../types'
import type { Workspace } from '../useWorkspace'
const EMPTY_JOBS: unknown[] = []

export function useConnectionModel(workspace: Workspace, preferredModel = '', preferredProvider = '') {
  const [models, setModels] = useState<RecordValue[]>([])
  const [model, setModel] = useState(
    preferredModel || connectionDownloadTarget(connectionDownload(workspace.snapshot?.setups ?? [])).model
  )
  const [provider, setProvider] = useState(preferredProvider)
  const initialized = useRef(Boolean(preferredModel))
  const [revision, setRevision] = useState(0)
  const [pendingJob, setPendingJob] = useState<RecordValue | null>(null)
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)
  const jobs = workspace.snapshot?.setups ?? EMPTY_JOBS
  const setupRevision = jobs
    .map(record)
    .map((v) => `${v.id ?? v.setup_id}:${v.stage}`)
    .join('|')
  const { execute } = workspace
  useEffect(() => {
    let live = true
    setChecking(true)
    void Promise.all([
      execute('models.installed'),
      initialized.current ? Promise.resolve(null) : execute('config.get'),
    ])
      .then(([value, config]) => {
        if (live) {
          setModels(rows(value))
          if (!initialized.current) {
            const saved = text(record(record(record(config).values).tui).model, '')
            if (saved) setModel(saved)
            initialized.current = true
          }
          setError('')
        }
      })
      .catch((e) => {
        if (live) setError(describeError(e))
      })
      .finally(() => {
        if (live) setChecking(false)
      })
    return () => {
      live = false
    }
  }, [execute, setupRevision, revision])
  useEffect(() => {
    if (
      pendingJob &&
      jobs.some((raw) => {
        const job = record(raw)
        return (job.id ?? job.setup_id) === (pendingJob.id ?? pendingJob.setup_id)
      })
    )
      setPendingJob(null)
  }, [jobs, pendingJob])
  const chosen = model ? models.find((m) => text(m.id ?? m.model_id) === model) : models[0]
  const modelId = model || (chosen ? text(chosen.id ?? chosen.model_id, '') : '')
  const selected = connectionModelState(
    modelId,
    models,
    pendingJob ? [...jobs, pendingJob] : jobs,
    workspace.snapshot?.downloads ?? [],
    provider
  )
  useEffect(() => {
    if (selected.provider && selected.provider !== provider) setProvider(selected.provider)
  }, [selected.provider, provider])
  return {
    models,
    modelId,
    selected: {
      ...selected,
      ready: selected.ready && !checking && !error,
      waiting: selected.waiting && !checking && !error,
      status: checking
        ? 'Checking downloaded models…'
        : error
          ? 'Retry the model check to continue.'
          : selected.status,
    },
    job: connectionDownload(jobs, modelId),
    error,
    checking,
    retry: () => setRevision((v) => v + 1),
    setProvider,
    choose: (id: string, engine = '', job?: RecordValue) => {
      initialized.current = true
      setModel(id)
      setProvider(engine)
      setPendingJob(job ?? null)
      setError('')
      setRevision((v) => v + 1)
    },
  }
}
