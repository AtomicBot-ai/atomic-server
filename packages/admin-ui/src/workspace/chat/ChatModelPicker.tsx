import { useState } from 'react'
import type { WorkspaceServiceRow } from '@contract'
import { Action } from '../Controls'
import type { ChatPreferences } from './chat-preferences'
const favoriteKey = (model: WorkspaceServiceRow) => `${model.provider}/${model.model}`
function modelLabel(model: string, raw: boolean) {
  return raw ? model : model.split('/').pop()?.replace(/[-_]/g, ' ') || model
}
export function ChatModelPicker({
  models,
  selected,
  setSelected,
  preferences,
  save,
  disabled,
  onCatalog,
}: {
  models: WorkspaceServiceRow[]
  selected: string
  setSelected: (v: string) => void
  preferences: ChatPreferences
  save: (v: ChatPreferences) => void
  disabled: boolean
  onCatalog: () => void
}) {
  const [query, setQuery] = useState('')
  const sorted = [...models]
    .filter((m) => `${m.provider} ${m.model}`.toLowerCase().includes(query.toLowerCase()))
    .sort(
      (a, b) =>
        Number(preferences.favorites.includes(favoriteKey(b))) -
        Number(preferences.favorites.includes(favoriteKey(a)))
    )
  const current = models.find((m) => m.id === selected)
  return (
    <details className="model-picker">
      <summary>
        {current
          ? `${current.provider} · ${modelLabel(current.model, preferences.rawNames)} · ${current.state}`
          : 'Choose a ready engine and model'}
      </summary>
      <input
        aria-label="Search ready models"
        placeholder="Search engines and models…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <select
        aria-label="Chat engine and model"
        disabled={disabled}
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="">Choose a ready model</option>
        {sorted.map((m) => (
          <option key={m.id} value={m.id} disabled={!['ready', 'loaded', 'running'].includes(m.state)}>
            {preferences.favorites.includes(favoriteKey(m)) ? '★ ' : ''}
            {m.provider} · {modelLabel(m.model, preferences.rawNames)} · {m.state}
          </option>
        ))}
        {current && !sorted.some((m) => m.id === current.id) && (
          <option value={current.id}>
            {current.provider} · {current.model}
          </option>
        )}
      </select>
      {current && (
        <>
          <div className="ew-muted">
            Full model ID: <code>{current.model}</code>
          </div>
          <Action
            disabled={disabled}
            onClick={() =>
              save({
                ...preferences,
                favorites: preferences.favorites.includes(favoriteKey(current))
                  ? preferences.favorites.filter((id) => id !== favoriteKey(current))
                  : [...preferences.favorites, favoriteKey(current)],
              })
            }
          >
            {preferences.favorites.includes(favoriteKey(current)) ? 'Remove favorite' : 'Add favorite'}
          </Action>
        </>
      )}
      {!models.length && <p>Load a model in Engines & Models before testing.</p>}
      <button type="button" onClick={onCatalog}>
        Manage engines & models
      </button>
    </details>
  )
}
