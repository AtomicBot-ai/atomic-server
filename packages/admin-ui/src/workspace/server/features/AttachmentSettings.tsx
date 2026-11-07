// Lifted from atomic-chat-ui/web-app/src/routes/settings/attachments.tsx @ 807b4d9; adapted: shared supported text ingestion.
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_ATTACHMENTS, type AttachmentSettings as Settings } from '@contract'
import type { Workspace } from '../../useWorkspace'
import { SettingsActions, SettingsField, SettingsSection } from '../../SettingsForm'
import { ATTACHMENT_NUMBERS, attachmentFieldError } from './attachment-fields'
import type { AttachmentDraft, NumericKey } from './attachment-fields'

export function AttachmentSettings({ workspace: w }: { workspace: Workspace }) {
  const incoming = w.snapshot?.features?.attachments ?? DEFAULT_ATTACHMENTS
  const [saved, setSaved] = useState(incoming)
  const [draft, setDraft] = useState<AttachmentDraft>(incoming)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const incomingSignature = JSON.stringify(incoming)
  const seenSnapshot = useRef(incomingSignature)
  useEffect(() => {
    // Unrelated workspace events can repeat the old settings before the save event arrives.
    if (seenSnapshot.current === incomingSignature) return
    seenSnapshot.current = incomingSignature
    setSaved(incoming)
    setDraft((current) => (dirty || saving ? current : incoming))
  }, [incoming, incomingSignature, dirty, saving])
  const change = (key: keyof Settings, value: unknown) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setDirty(true)
    setNotice('')
  }
  const keys = Object.keys(ATTACHMENT_NUMBERS) as NumericKey[]
  const valid = keys.every((key) => !attachmentFieldError(key, draft))
  const number = (key: NumericKey) => {
    const field = ATTACHMENT_NUMBERS[key]
    return (
      <SettingsField
        key={key}
        label={field.label}
        hint={field.hint}
        unit={'unit' in field ? field.unit : undefined}
        error={attachmentFieldError(key, draft)}
      >
        <input
          type="number"
          min={field.min}
          max={field.max}
          step={'fractional' in field ? 'any' : 1}
          value={draft[key]}
          onChange={(e) => change(key, e.target.value)}
        />
      </SettingsField>
    )
  }
  const embeddingModels = [
    ...new Set(w.snapshot?.services.filter((s) => s.kind === 'embedding').map((s) => s.model) ?? []),
  ]
  if (draft.embedding_model && !embeddingModels.includes(draft.embedding_model))
    embeddingModels.push(draft.embedding_model)
  return (
    <div className="settings-form attachment-settings">
      <fieldset disabled={saving} className="settings-form-fields">
        <SettingsSection
          title="Documents"
          description="Attach PDF, Office documents, text, Markdown, CSV, JSON and source files."
        >
          <SettingsField label="Document attachments" hint="Allow documents to be added to conversations.">
            <input
              type="checkbox"
              role="switch"
              checked={draft.enabled}
              onChange={(e) => change('enabled', e.target.checked)}
            />
          </SettingsField>
          {number('max_file_size_mb')}
          <SettingsField
            label="Document handling"
            hint="Use the full document or find passages relevant to your message."
          >
            <select value={draft.parse_mode} onChange={(e) => change('parse_mode', e.target.value)}>
              <option value="auto">Automatic</option>
              <option value="inline">Full document</option>
              <option value="embeddings">Embedding retrieval</option>
              <option value="retrieval">Text matching</option>
            </select>
          </SettingsField>
        </SettingsSection>
        <SettingsSection
          title="Retrieval"
          description="These settings apply when a document is searched for relevant passages."
        >
          {number('retrieval_limit')}
          <SettingsField
            label="Embedding model"
            hint="Embedding retrieval needs a running embedding model. Automatic uses an available model."
          >
            <select value={draft.embedding_model} onChange={(e) => change('embedding_model', e.target.value)}>
              <option value="">Automatic</option>
              {embeddingModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </SettingsField>
          <details className="settings-disclosure">
            <summary>Advanced retrieval</summary>
            {number('retrieval_threshold')}
            {number('chunk_size_chars')}
            {number('overlap_chars')}
            {number('auto_inline_context_ratio')}
            <SettingsField label="Search mode" hint="Both options currently use exact search.">
              <select value={draft.search_mode} onChange={(e) => change('search_mode', e.target.value)}>
                <option value="auto">Automatic</option>
                <option value="linear">Exact</option>
              </select>
            </SettingsField>
          </details>
        </SettingsSection>
        <SettingsSection title="Images" description="Resize images before sending them to a model.">
          <SettingsField
            label="Maximum image size"
            hint="Limit the longest edge. Original keeps the uploaded dimensions."
          >
            <select
              value={draft.max_image_size_px}
              onChange={(e) => change('max_image_size_px', Number(e.target.value))}
            >
              {[...new Set([0, 768, 1024, 1536, 2048, 3072, draft.max_image_size_px])]
                .sort((a, b) => a - b)
                .map((size) => (
                  <option key={size} value={size}>
                    {size ? `${size} px` : 'Original'}
                  </option>
                ))}
            </select>
          </SettingsField>
        </SettingsSection>
      </fieldset>
      {dirty && (
        <SettingsActions
          saving={saving}
          valid={valid}
          onDiscard={() => {
            setDraft(saved)
            setDirty(false)
            setNotice('')
          }}
          onSave={async () => {
            setSaving(true)
            const value = {
              ...draft,
              ...Object.fromEntries(keys.map((key) => [key, Number(draft[key])])),
            } as Settings
            try {
              await w.execute('attachments.update', { value })
              setSaved(value)
              setDraft(value)
              setDirty(false)
              setNotice('Changes saved.')
            } finally {
              setSaving(false)
            }
          }}
        />
      )}
      {notice && <p role="status">{notice}</p>}
    </div>
  )
}
