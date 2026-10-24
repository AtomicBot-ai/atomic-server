import { useDialog } from '../useDialog'
import { useEffect, useRef, useState } from 'react'
import type { Execute, RecordValue } from '../types'
import { bytes, record, rows, text } from '../types'
import { Action, Field, JsonResult } from '../Controls'
import { PlanCommands } from './PlanCommands'
import { describeError } from '@/services/admin-api'

export function ModelInstall({
  autoStart = false,
  initialFile = '',
  initialQuant = '',
  expectedEngine,
  technical = false,
  model,
  category,
  execute,
  onClose,
  onStarted,
  onNoGguf,
}: {
  autoStart?: boolean
  initialFile?: string
  initialQuant?: string
  expectedEngine?: string
  technical?: boolean
  model: RecordValue
  category: string
  execute: Execute
  onClose: () => void
  onStarted?: (result: unknown) => void | Promise<void>
  /** A repository with no GGUF file: the managed engines' path, when the host has one. */
  onNoGguf?: (repository: string) => void
}) {
  const [committing, setCommitting] = useState(false)
  const dialog = useDialog(() => {
    if (!committing) onClose()
  })
  const id = text(model.id ?? model.model_name ?? model.repo, '')
  const gguf = category === 'text' && record(model.source).format !== 'mlx'
  const [files, setFiles] = useState<RecordValue[]>([])
  const [file, setFile] = useState('')
  const [quant, setQuant] = useState(initialQuant)
  const [plan, setPlan] = useState<RecordValue | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(gguf)
  const [planning, setPlanning] = useState(true)
  const [revision, setRevision] = useState(0)
  const active = useRef(true)
  const selection = useRef('')
  selection.current = JSON.stringify([category, id, file, quant, revision])
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  // The latest callback, read when the lookup answers: the lookup itself runs once per model.
  const noGguf = useRef(onNoGguf)
  noGguf.current = onNoGguf
  const source = record(model.source)
  const quants = Array.isArray(record(source.transformer).quants)
    ? (record(source.transformer).quants as unknown[])
    : Array.isArray(source.quants)
      ? source.quants
      : Array.isArray(model.quants)
        ? model.quants
        : []
  useEffect(() => {
    let active = true
    if (gguf)
      void execute('models.files', { repo: id })
        .then((result) => {
          if (active) {
            const entries = rows(result)
            setFiles(entries)
            setFile(
              entries.some((entry) => (entry.filename ?? entry.path) === initialFile)
                ? initialFile
                : text(entries[0]?.filename ?? entries[0]?.path, '')
            )
          }
        })
        .catch((e) => {
          if (!active) return
          const missing =
            (e as { code?: string }).code === 'MODEL_NOT_FOUND' && /no gguf/i.test(describeError(e))
          if (missing && noGguf.current) noGguf.current(id)
          else setError(describeError(e))
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    return () => {
      active = false
    }
  }, [category, gguf, id, execute, revision, initialFile])
  useEffect(() => {
    if (loading || (gguf && !file)) return
    let active = true
    setPlanning(true)
    setPlan(null)
    setError('')
    void execute(
      gguf ? 'models.plan' : 'artifacts.plan',
      gguf
        ? { repo: id, file, include_projector: true }
        : { category, model_id: id, ...(quant ? { quant } : {}) }
    )
      .then((result) => {
        if (active) setPlan(record(result))
      })
      .catch((e) => {
        if (active) setError(describeError(e))
      })
      .finally(() => {
        if (active) setPlanning(false)
      })
    return () => {
      active = false
    }
  }, [execute, loading, gguf, id, file, category, quant, revision])
  const started = useRef('')
  const callbacks = useRef({ onStarted, onClose })
  callbacks.current = { onStarted, onClose }
  const request = { repo: id, file, include_projector: true }
  const blockers = [...(Array.isArray(plan?.blockers) ? plan.blockers : [])]
  const plannedEngine = text(
    plan?.provider ?? (typeof plan?.engine === 'string' ? plan.engine : record(plan?.engine).provider),
    ''
  )
  if (
    plan &&
    expectedEngine &&
    plannedEngine !== expectedEngine &&
    !(expectedEngine === 'llamacpp' && plannedEngine === 'llamacpp-upstream')
  )
    blockers.push(
      `This file requires ${plannedEngine || 'another engine'}. You chose ${expectedEngine}. Go back and change the engine or choose a different model.`
    )
  const blocked = blockers.length > 0
  useEffect(() => {
    if (!autoStart || !plan || planning || blocked || error) return
    const digest = text(plan.digest ?? plan.plan_digest, '')
    const key = `${id}:${digest}:${revision}`
    if (started.current === key) return
    started.current = key
    const input = { plan_digest: digest, request_id: crypto.randomUUID() }
    const selected = selection.current
    void execute(
      gguf ? 'models.install' : 'artifacts.install',
      gguf ? { ...input, request: { repo: id, file, include_projector: true } } : input
    )
      .then(async (result) => {
        if (!active.current || selection.current !== selected) return
        setCommitting(true)
        try {
          await callbacks.current.onStarted?.(result)
          if (active.current) callbacks.current.onClose()
        } finally {
          setCommitting(false)
        }
      })
      .catch((e) => {
        if (active.current && selection.current === selected) setError(describeError(e))
      })
  }, [autoStart, plan, planning, blocked, error, execute, gguf, id, file, revision])
  return (
    <div className="modal-shade">
      <section
        ref={dialog}
        tabIndex={-1}
        className="ew-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Install model"
      >
        <div className="panel-heading">
          <h2>{text(model.title ?? model.name, id)}</h2>
          <button className="ew-button" disabled={committing} onClick={onClose}>
            Close
          </button>
        </div>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        {!autoStart && (
          <details>
            <summary>Download options</summary>
            {gguf ? (
              <Field label="Model file">
                <select
                  value={file}
                  disabled={loading || committing}
                  onChange={(e) => {
                    setPlan(null)
                    setFile(e.target.value)
                  }}
                >
                  <option value="">{loading ? 'Loading files…' : 'Choose a file'}</option>
                  {files.map((row) => (
                    <option key={text(row.filename ?? row.path)} value={text(row.filename ?? row.path)}>
                      {text(row.filename ?? row.path)} · {bytes(row.size)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : quants.length > 0 ? (
              <Field label="Quantization">
                <select
                  value={quant}
                  disabled={committing}
                  onChange={(e) => {
                    setPlan(null)
                    setQuant(e.target.value)
                  }}
                >
                  <option value="">Recommended</option>
                  {quants.map((q, i) => (
                    <option key={i} value={typeof q === 'string' ? q : text(record(q).id ?? record(q).quant)}>
                      {typeof q === 'string' ? q : text(record(q).label ?? record(q).id ?? record(q).quant)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            {technical && plan && <JsonResult value={plan} />}
          </details>
        )}
        {(loading || planning) && !error && <p role="status">Checking download…</p>}
        {autoStart && !error && (
          <p role="status">
            {blocked
              ? blockers.map((b) => (typeof b === 'string' ? b : text(record(b).message))).join(' ')
              : 'Starting download…'}
          </p>
        )}
        {error && <Action onClick={() => setRevision((v) => v + 1)}>Retry</Action>}
        {plan && !planning && !autoStart && (
          <>
            <div className="plan-facts">
              <div>
                <span>Download</span>
                <strong>{bytes(plan.total_download_bytes ?? plan.total_bytes)}</strong>
              </div>
            </div>
            {technical && (
              <PlanCommands
                execute={execute}
                plan={plan}
                request={gguf ? request : { category, model_id: id, ...(quant ? { quant } : {}) }}
                gguf={gguf}
                engine={expectedEngine || plannedEngine}
                blocked={blockers.length > 0}
              />
            )}
            {blockers.length > 0 && (
              <ul role="alert">
                {blockers.map((item, i) => (
                  <li key={i}>
                    {typeof item === 'string' ? item : text(record(item).message ?? record(item).code)}
                  </li>
                ))}
              </ul>
            )}
            <div className="ew-actions">
              <Action
                primary
                disabled={blockers.length > 0}
                onClick={async () => {
                  const input = {
                    plan_digest: text(plan.digest ?? plan.plan_digest, ''),
                    request_id: crypto.randomUUID(),
                  }
                  const selected = selection.current
                  const result = await execute(
                    gguf ? 'models.install' : 'artifacts.install',
                    gguf ? { ...input, request } : input
                  )
                  if (!active.current || selection.current !== selected) return
                  setCommitting(true)
                  try {
                    await callbacks.current.onStarted?.(result)
                    if (active.current) callbacks.current.onClose()
                  } finally {
                    setCommitting(false)
                  }
                }}
              >
                Download
              </Action>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
