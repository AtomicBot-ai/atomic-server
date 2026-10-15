import { useDialog } from '../useDialog'
import { useEffect, useState } from 'react'
import type { Execute, RecordValue } from '../types'
import { bytes, record, rows, text } from '../types'
import { Action, Field, JsonResult } from '../Controls'
import { PlanCommands } from './PlanCommands'
import { describeError } from '@/services/admin-api'

export function ModelInstall({
  expectedEngine,
  technical = false,
  model,
  category,
  execute,
  onClose,
  onStarted,
}: {
  expectedEngine?: string
  technical?: boolean
  model: RecordValue
  category: string
  execute: Execute
  onClose: () => void
  onStarted?: (result: unknown) => void
}) {
  const dialog = useDialog(onClose)
  const id = text(model.id ?? model.model_name ?? model.repo, '')
  const gguf = category === 'text' && record(model.source).format !== 'mlx'
  const [files, setFiles] = useState<RecordValue[]>([])
  const [file, setFile] = useState('')
  const [quant, setQuant] = useState('')
  const [plan, setPlan] = useState<RecordValue | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(gguf)
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
            setFile(text(entries[0]?.filename ?? entries[0]?.path, ''))
          }
        })
        .catch((e) => {
          if (active) setError(describeError(e))
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    return () => {
      active = false
    }
  }, [category, gguf, id, execute])
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
          <button className="ew-button" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="ew-muted">{id}</p>
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        {!plan ? (
          <>
            {gguf ? (
              <Field label="Model file">
                <select value={file} disabled={loading} onChange={(e) => setFile(e.target.value)}>
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
                <select value={quant} onChange={(e) => setQuant(e.target.value)}>
                  <option value="">Recommended</option>
                  {quants.map((q, i) => (
                    <option key={i} value={typeof q === 'string' ? q : text(record(q).id ?? record(q).quant)}>
                      {typeof q === 'string' ? q : text(record(q).label ?? record(q).id ?? record(q).quant)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Action
              primary
              disabled={loading || (gguf && !file)}
              onClick={async () =>
                setPlan(
                  record(
                    await execute(
                      gguf ? 'models.plan' : 'artifacts.plan',
                      gguf ? request : { category, model_id: id, ...(quant ? { quant } : {}) }
                    )
                  )
                )
              }
            >
              Review download
            </Action>
          </>
        ) : (
          <>
            <div className="plan-facts">
              <div>
                <span>Download</span>
                <strong>{bytes(plan.total_download_bytes ?? plan.total_bytes)}</strong>
              </div>
              <div>
                <span>Available disk</span>
                <strong>{bytes(plan.free_bytes)}</strong>
              </div>
              <div>
                <span>{expectedEngine ? 'Selected engine' : 'Engine'}</span>
                <strong>{text(expectedEngine || plannedEngine)}</strong>
              </div>
            </div>
            <p className="ew-muted">
              Review compatibility below. Any missing engine build is prepared before loading; its download
              may be additional to the model size shown.
            </p>
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
            <details>
              <summary>Files and compatibility</summary>
              <JsonResult value={plan} />
            </details>
            <div className="ew-actions">
              <Action onClick={() => setPlan(null)}>Back</Action>
              <Action
                primary
                disabled={blockers.length > 0}
                onClick={async () => {
                  const input = {
                    plan_digest: text(plan.digest ?? plan.plan_digest, ''),
                    request_id: crypto.randomUUID(),
                  }
                  const result = await execute(
                    gguf ? 'models.install' : 'artifacts.install',
                    gguf ? { ...input, request } : input
                  )
                  onStarted?.(result)
                  onClose()
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
