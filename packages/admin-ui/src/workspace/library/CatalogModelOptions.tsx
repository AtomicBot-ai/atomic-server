// Lifted from Atomic-Chat/web-app/src/containers/hub/ModelListRow.tsx @ 5043013; adapted: server file lookup.
import { useEffect, useRef, useState } from 'react'
import type { Execute, RecordValue } from '../types'
import { bytes, record, rows, text } from '../types'
import { Action, Field } from '../Controls'
import { describeError } from '@/services/admin-api'
export function CatalogModelOptions({
  model,
  category,
  execute,
  choose,
  onNoGguf,
}: {
  model: RecordValue
  category: string
  execute: Execute
  choose: (model: RecordValue) => void
  onNoGguf?: (repository: string) => void
}) {
  const source = record(model.source)
  const gguf =
    category === 'text' &&
    source.format !== 'mlx' &&
    !['safetensors', 'Foundry Local'].includes(text(model.format))
  const [files, setFiles] = useState<RecordValue[]>([])
  const [file, setFile] = useState('')
  const quants = record(source.transformer).quants ?? source.quants ?? model.quants
  const variants = Array.isArray(quants)
    ? quants
        .map((q) => (typeof q === 'string' ? q : text(record(q).id ?? record(q).name, '')))
        .filter(Boolean)
    : []
  const [quant, setQuant] = useState('')
  const [loading, setLoading] = useState(gguf)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [needsEngine, setNeedsEngine] = useState(false)
  const missing = useRef(onNoGguf)
  missing.current = onNoGguf
  const id = text(model.id ?? model.repo)
  useEffect(() => {
    if (!gguf) return
    let live = true
    setLoading(true)
    setError('')
    void execute('models.files', { repo: id })
      .then((result) => {
        if (!live) return
        const entries = rows(result)
        setFiles(entries)
        setFile(text(entries[0]?.filename ?? entries[0]?.path, ''))
      })
      .catch((e) => {
        if (!live) return
        if (
          (e as { code?: string }).code === 'MODEL_NOT_FOUND' &&
          /no gguf/i.test(describeError(e)) &&
          missing.current
        ) {
          setNeedsEngine(true)
          missing.current(id)
        } else setError(describeError(e))
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [execute, gguf, id, revision])
  return (
    <>
      {needsEngine ? (
        <Action onClick={() => missing.current?.(id)}>Choose a compatible engine</Action>
      ) : (
        <>
          {gguf && (
            <Field label="Variant">
              <select
                aria-label={`Variant for ${text(model.name ?? model.title, id)}`}
                value={file}
                disabled={loading}
                onChange={(e) => setFile(e.target.value)}
              >
                {loading ? (
                  <option>Loading variants…</option>
                ) : files.length ? (
                  files.map((f) => (
                    <option key={text(f.filename ?? f.path)} value={text(f.filename ?? f.path)}>
                      {text(f.filename ?? f.path)}
                      {typeof f.size === 'number' ? ` · ${bytes(f.size)}` : ''}
                    </option>
                  ))
                ) : (
                  <option value="">No GGUF files available</option>
                )}
              </select>
            </Field>
          )}
          {!gguf && variants.length > 0 && (
            <Field label="Variant">
              <select
                aria-label={`Variant for ${text(model.name ?? model.title, id)}`}
                value={quant || variants[0]}
                onChange={(e) => setQuant(e.target.value)}
              >
                {variants.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {error && (
            <p role="alert">
              {error} <Action onClick={() => setRevision((v) => v + 1)}>Retry</Action>
            </p>
          )}
          <Action
            primary
            disabled={loading || (gguf && !file)}
            onClick={() =>
              choose({
                ...model,
                selectedFile: file,
                ...(variants.length ? { selectedQuant: quant || variants[0] } : {}),
              })
            }
          >
            Download
          </Action>
        </>
      )}
    </>
  )
}
