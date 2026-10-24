// Lifted from atomic-chat-ui routes/settings/attachments.tsx @ 807b4d9; adapted: shared supported text ingestion.
import { useEffect, useState } from 'react'
import { DEFAULT_ATTACHMENTS, type AttachmentSettings as Settings } from '@contract'
import type { Workspace } from '../useWorkspace'
import { Action, Field } from '../Controls'
export function AttachmentSettings({ workspace: w }: { workspace: Workspace }) {
  const saved = w.snapshot?.features?.attachments ?? DEFAULT_ATTACHMENTS
  const [draft, setDraft] = useState<Settings>(saved),
    [dirty, setDirty] = useState(false)
  useEffect(() => {
    if (!dirty) setDraft(saved)
  }, [saved, dirty])
  const change = (key: keyof Settings, value: unknown) => {
    setDraft({ ...draft, [key]: value })
    setDirty(true)
  }
  return (
    <>
      <section className="settings-card">
        <div className="settings-item">
          <label>
            <strong>Document attachments</strong>
            <small>Text, Markdown, CSV, JSON and source files.</small>
          </label>
          <input
            type="checkbox"
            role="switch"
            aria-label="Document attachments"
            checked={draft.enabled}
            onChange={(e) => change('enabled', e.target.checked)}
          />
        </div>
        {[
          ['max_file_size_mb', 'Maximum file size (MB)'],
          ['retrieval_limit', 'Retrieval limit'],
          ['retrieval_threshold', 'Retrieval threshold'],
          ['chunk_size_chars', 'Chunk size (characters)'],
          ['overlap_chars', 'Chunk overlap (characters)'],
          ['auto_inline_context_ratio', 'Automatic inline context ratio'],
        ].map(([key, label]) => (
          <div className="settings-item" key={key}>
            <label htmlFor={key}>{label}</label>
            <input
              id={key}
              type="number"
              step={key === 'retrieval_threshold' ? 0.05 : 1}
              value={Number(draft[key as keyof Settings])}
              onChange={(e) => change(key as keyof Settings, Number(e.target.value))}
            />
          </div>
        ))}
        <div className="settings-item">
          <label htmlFor="parse-mode">Parse mode</label>
          <select
            id="parse-mode"
            value={draft.parse_mode}
            onChange={(e) => change('parse_mode', e.target.value)}
          >
            <option value="auto">Automatic</option>
            <option value="inline">Full document</option>
            <option value="embeddings">Embedding retrieval</option>
            <option value="retrieval">Text matching</option>
          </select>
        </div>
        <div className="settings-item">
          <label htmlFor="embedding-model">Embedding model</label>
          <select
            id="embedding-model"
            value={draft.embedding_model}
            onChange={(e) => change('embedding_model', e.target.value)}
          >
            <option value="">Automatic</option>
            {w.snapshot?.services
              .filter((service) => service.kind === 'embedding')
              .map((service) => (
                <option key={service.id} value={service.model}>
                  {service.model}
                </option>
              ))}
          </select>
        </div>
        <div className="settings-item">
          <label htmlFor="search-mode">Search mode</label>
          <select
            id="search-mode"
            value={draft.search_mode}
            onChange={(e) => change('search_mode', e.target.value)}
          >
            <option value="auto">Automatic</option>
            <option value="linear">Exact</option>
          </select>
        </div>
        <p className="feature-note">
          PDF, DOCX, XLSX, PPTX and text documents are supported. Embedding retrieval requires a running
          embedding model.
        </p>
      </section>
      <section className="settings-card">
        <Field label="Maximum image size">
          <select
            value={draft.max_image_size_px}
            onChange={(e) => change('max_image_size_px', Number(e.target.value))}
          >
            {[0, 768, 1024, 1536, 2048, 3072].map((size) => (
              <option key={size} value={size}>
                {size ? `${size} px` : 'Original'}
              </option>
            ))}
          </select>
        </Field>
      </section>
      {dirty && (
        <div className="ew-actions">
          <Action
            onClick={() => {
              setDraft(saved)
              setDirty(false)
            }}
          >
            Discard
          </Action>
          <Action
            primary
            onClick={async () => {
              await w.execute('attachments.update', { value: draft })
              setDirty(false)
            }}
          >
            Save changes
          </Action>
        </div>
      )}
    </>
  )
}
