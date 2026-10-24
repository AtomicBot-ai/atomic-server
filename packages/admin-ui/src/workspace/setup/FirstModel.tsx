// Lifted from Atomic-Chat/web-app/src/preview/onboarding/ModelSelection.tsx @ 807b4d9; adapted: live server catalog.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Laptop, Check } from 'lucide-react'
import { ModelMark } from '../library/ModelMark'
import { Action } from '../Controls'
import { bytes, record, rows, text } from '../types'
import type { RecordValue } from '../types'
import type { Workspace } from '../useWorkspace'
import { describeError } from '@/services/admin-api'
import { engineModels } from './setup-data'

export function FirstModel({
  workspace: w,
  select,
  advanced,
  onSkip,
  actionContainer,
  category = 'text',
}: {
  workspace: Workspace
  select: (model: RecordValue, installed: boolean) => void | Promise<void>
  advanced?: () => void
  onSkip?: () => void | Promise<void>
  actionContainer?: HTMLElement | null
  category?: string
}) {
  const [models, setModels] = useState<RecordValue[]>([])
  const [installed, setInstalled] = useState<RecordValue[]>([])
  const [selected, setSelected] = useState('')
  const [engine, setEngine] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [hardware, setHardware] = useState<RecordValue>({})
  const { execute } = w
  useEffect(() => {
    let live = true
    void execute('hardware.info')
      .then((value) => {
        if (live) setHardware(record(record(value).info))
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [execute])
  useEffect(() => {
    let live = true
    setLoading(true)
    setError('')
    void Promise.all([
      execute('models.catalog', { category }),
      category === 'text' ? execute('models.installed') : Promise.resolve([]),
      execute('engines.selected'),
    ])
      .then(([catalog, local, selection]) => {
        if (!live) return
        const selectedEngine = text(record(selection).engine, '')
        setEngine(selectedEngine)
        const available = selectedEngine
          ? engineModels(rows(catalog), selectedEngine, category)
          : rows(catalog)
        setModels(
          available.filter(
            (m) =>
              !rows(local).some((l) => {
                const id = text(l.id ?? l.model_id, '')
                const repo = text(m.id ?? m.model_id, '')
                return id === repo || id.startsWith(repo + '/')
              })
          )
        )
        setInstalled(rows(local))
        const first = rows(local)[0] ?? available[0]
        setSelected(
          first ? `${rows(local).length ? 'local' : 'catalog'}:${text(first.id ?? first.model_id)}` : ''
        )
      })
      .catch((e) => {
        if (live) setError(describeError(e))
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [execute, category, revision])
  const cards = (entries: RecordValue[], local: boolean) =>
    entries.map((m) => {
      const id = `${local ? 'local' : 'catalog'}:${text(m.id ?? m.model_id)}`
      const source = record(m.source)
      const size = m.size ?? m.total_bytes ?? source.size
      return (
        <button
          key={id}
          className={`first-model-card ${selected === id ? 'selected' : ''}`}
          aria-pressed={selected === id}
          onClick={() => setSelected(id)}
        >
          <ModelMark model={m} />
          <span className="first-model-text">
            <strong>{text(m.name ?? m.title ?? m.id ?? m.model_id)}</strong>
            {Boolean(m.description ?? m.summary) && <small>{text(m.description ?? m.summary)}</small>}
            {typeof size === 'number' && size > 0 && <small>{bytes(size)} download</small>}
          </span>
          {local && (
            <small className="first-model-downloaded">
              <Check size={13} aria-hidden="true" /> Downloaded
            </small>
          )}
          <i className="first-model-radio" aria-hidden="true" />
        </button>
      )
    })
  const local = selected.startsWith('local:')
  const choice = (local ? installed : models).find(
    (m) => `${local ? 'local' : 'catalog'}:${text(m.id ?? m.model_id)}` === selected
  )
  const continueAction = (
    <Action
      primary
      disabled={!choice || loading}
      onClick={() => {
        if (choice) return select({ ...choice, onboarding_engine: engine }, local)
      }}
    >
      Continue
    </Action>
  )
  return (
    <div className="first-model-selection">
      {Boolean(hardware.os_name || record(hardware.cpu).name || hardware.total_memory) && (
        <div className="first-device">
          <Laptop size={20} aria-hidden="true" />
          <div>
            <strong>{text(record(hardware.cpu).name ?? hardware.os_name, 'This device')}</strong>
            {typeof hardware.total_memory === 'number' && (
              <small>{bytes(hardware.total_memory * 1024 * 1024)} memory</small>
            )}
          </div>
        </div>
      )}
      <div className="first-model-catalog" role="region" aria-label="Choose a model" tabIndex={0}>
        {loading && <p role="status">Loading models…</p>}
        {error && (
          <p role="alert" className="ew-error">
            {error}
          </p>
        )}
        {!!installed.length && (
          <>
            <h2>On this device</h2>
            <div className="first-model-grid">{cards(installed, true)}</div>
          </>
        )}
        {!!models.length && (
          <>
            <h2>Recommended</h2>
            <div className="first-model-grid">{cards(models.slice(0, 3), false)}</div>
            {models.length > 3 && (
              <>
                <h2>Hugging Face</h2>
                <div className="first-model-grid">{cards(models.slice(3), false)}</div>
              </>
            )}
          </>
        )}
        {!loading && !models.length && !installed.length && (
          <p>No models are available. Retry or skip setup.</p>
        )}
        {(error || (!loading && !models.length && !installed.length)) && (
          <Action onClick={() => setRevision((v) => v + 1)}>Retry</Action>
        )}
      </div>
      {actionContainer === undefined ? (
        <div className="first-model-actionbar">{continueAction}</div>
      ) : actionContainer ? (
        createPortal(continueAction, actionContainer)
      ) : null}
      {(onSkip || advanced) && (
        <div className="ew-actions first-run-actions">
          {onSkip && (
            <span className="first-run-skip">
              <Action onClick={onSkip}>Skip setup</Action>
            </span>
          )}
          {advanced && <Action onClick={advanced}>Browse all models</Action>}
        </div>
      )}
    </div>
  )
}
