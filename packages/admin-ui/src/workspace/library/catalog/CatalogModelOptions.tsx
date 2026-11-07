// Lifted from Atomic-Chat/web-app/src/containers/hub/ModelListRow.tsx @ 5043013; adapted: server file lookup and compact, labelled download variants.
import { useEffect, useRef, useState } from 'react'
import type { Execute, RecordValue } from '../../types'
import { bytes, record, rows, text } from '../../types'
import { Action } from '../../Controls'
import { catalogDownloadOptions } from './catalog-download-options'
import './catalog-download-options.css'
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
  const variants = catalogDownloadOptions(model, gguf ? files : undefined)
  return (
    <>
      {needsEngine ? (
        <Action onClick={() => missing.current?.(id)}>Choose a compatible engine</Action>
      ) : (
        <>
          {loading && <p role="status">Loading variants…</p>}
          {!loading && gguf && !files.length && !error && <p>No GGUF files available</p>}
          {!loading && !error && variants.length > 0 && (
            <section className="catalog-variants" aria-label="Download options">
              <div className="catalog-variants-heading">
                <strong>{variants.length > 1 ? 'Choose a variant' : 'Download model'}</strong>
                <span>
                  {variants.length} {variants.length === 1 ? 'variant' : 'variants'}
                </span>
              </div>
              <ul className="catalog-download-rows" aria-label="Download variants">
                {variants.map((v) => (
                  <li className="catalog-download-row" key={v.value}>
                    <span className="catalog-variant-name">
                      {v.label}
                      {v.recommended && <small className="catalog-variant-recommended">Recommended</small>}
                    </span>
                    <span className="catalog-variant-size">
                      {v.size === null ? 'Size unavailable' : bytes(v.size)}
                      {v.size !== null && <small>Model file</small>}
                    </span>
                    <Action
                      onClick={() =>
                        choose({
                          ...model,
                          ...(gguf ? { selectedFile: v.value } : v.value ? { selectedQuant: v.value } : {}),
                        })
                      }
                    >
                      Download
                    </Action>
                  </li>
                ))}
              </ul>
              <p className="catalog-variants-note">
                {category === 'image' || category === 'video'
                  ? 'Additional components may be required. Review the full download on the next step.'
                  : 'Review the download details on the next step.'}
              </p>
            </section>
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
