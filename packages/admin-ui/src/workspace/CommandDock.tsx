import { useMemo, useState } from 'react'
import type { WorkspaceOperation } from '@contract'
import type { Execute } from './types'
import { OperationForm } from './OperationForm'
import { Copy } from './Controls'

export function CommandDock({
  operations,
  execute,
  onClose,
  selected,
}: {
  operations: WorkspaceOperation[]
  execute: Execute
  onClose: () => void
  selected?: string
}) {
  const [query, setQuery] = useState('')
  const [name, setName] = useState(selected ?? 'api.ping')
  const choices = useMemo(
    () =>
      operations.filter((op) =>
        `${op.name} ${op.title} ${op.group}`.toLowerCase().includes(query.toLowerCase())
      ),
    [operations, query]
  )
  const operation = operations.find((op) => op.name === name)
  return (
    <section className="command-dock" aria-label="Server commands">
      <div className="panel-heading">
        <h2>Server commands</h2>
        <button className="ew-button" onClick={onClose} title="Close commands · F4">
          Close
        </button>
      </div>
      <div className="command-controls">
        <input
          aria-label="Find command"
          placeholder="Find a command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <select aria-label="Command" value={name} onChange={(e) => setName(e.target.value)}>
          {!choices.some((op) => op.name === name) && <option value={name}>{name}</option>}
          {choices.map((op) => (
            <option key={op.name} value={op.name}>
              {op.title} · {op.name}
            </option>
          ))}
        </select>
        <Copy value="atc control list --json" label="Copy agent discovery command" />
      </div>
      {operation ? (
        <OperationForm key={operation.name} operation={operation} execute={execute} />
      ) : (
        <p className="ew-muted">Loading available commands…</p>
      )}
    </section>
  )
}
