// Lifted from Atomic-Chat/web-app/src/containers/hub/ModelListRow.tsx @ 5043013; adapted: server file lookup.
import { useEffect, useRef, useState } from 'react'
import type { Execute, RecordValue } from '../../types'
import { bytes, record, rows, text } from '../../types'
import { Action } from '../../Controls'
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
  const quants = record(source.transformer).quants ?? source.quants ?? model.quants
  const variants = Array.isArray(quants)
    ? quants
        .map((q) => (typeof q === 'string' ? q : text(record(q).id ?? record(q).name, '')))
        .filter(Boolean)
    : []
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
          {loading && <p role="status">Loading variants…</p>}
          {!loading && gguf && !files.length && !error && <p>No GGUF files available</p>}
          {!loading && !error && (
            <div className="catalog-download-rows">
              {(gguf
                ? files.map((f) => ({
                    value: text(f.filename ?? f.path),
                    label: `${text(f.filename ?? f.path)}${typeof f.size === 'number' ? ` · ${bytes(f.size)}` : ''}`,
                  }))
                : variants.length
                  ? variants.map((v) => ({ value: v, label: v }))
                  : [{ value: '', label: text(model.name ?? model.title, id) }]
              ).map((v) => (
                <div className="catalog-download-row" key={v.value}>
                  <span>{v.label}</span>
                  <Action
                    primary
                    onClick={() =>
                      choose({
                        ...model,
                        ...(gguf
                          ? { selectedFile: v.value }
                          : variants.length
                            ? { selectedQuant: v.value }
                            : {}),
                      })
                    }
                  >
                    Download
                  </Action>
                </div>
              ))}
            </div>
          )}
          {error && (
            <p role="alert">
              {error} <Action onClick={() => setRevision((v) => v + 1)}>Retry</Action>
            </p>
          )}
        </>
      )}
    </>
  )
}
