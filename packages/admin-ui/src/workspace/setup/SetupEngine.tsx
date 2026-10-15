import { useEffect, useState } from 'react'
import { Action, Field } from '../Controls'
import type { Workspace } from '../useWorkspace'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
import { describeError } from '@/services/admin-api'

const LABELS: Record<string, string> = {
  'llamacpp-upstream': 'llama.cpp — standard GGUF models',
  'llamacpp': 'TurboQuant — GGUF models with additional tuning',
  'atomic-prism': 'Atomic Prism — models that require Prism',
  'mlx': 'MLX — Apple Silicon models',
  'sd-cpp': 'stable-diffusion.cpp — image and video models',
}
export function SetupEngine({
  workspace: w,
  category,
  engine,
  setEngine,
  onContinue,
}: {
  workspace: Workspace
  category: string
  engine: string
  setEngine: (value: string) => void
  onContinue: () => void
}) {
  const [engines, setEngines] = useState<RecordValue[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const { execute } = w
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void execute('engines.list')
      .then((result) => {
        if (active) setEngines(rows(result))
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
  }, [execute, revision])
  const choices = engines.filter((entry) => {
    const id = text(entry.engine)
    if (category === 'image' || category === 'video') return id === 'sd-cpp'
    if (category === 'decision') return id === 'llamacpp'
    if (category === 'embedding') return ['llamacpp-upstream', 'llamacpp'].includes(id)
    return ['llamacpp-upstream', 'llamacpp', 'atomic-prism', 'mlx'].includes(id)
  })
  const selected = choices.find((entry) => entry.engine === engine)
  const available = (entry: RecordValue) => Boolean(entry.active || entry.latest)
  return (
    <>
      <Field
        label="1. Choose an engine"
        hint="An engine runs the model for your agent. Start with standard llama.cpp for GGUF models; the file review checks exact compatibility."
      >
        <select
          aria-label="Setup engine"
          value={engine}
          disabled={loading}
          onChange={(e) => setEngine(e.target.value)}
        >
          <option value="">{loading ? 'Checking engines for this computer…' : 'Choose an engine'}</option>
          {choices.map((entry) => (
            <option key={text(entry.engine)} value={text(entry.engine)} disabled={!available(entry)}>
              {LABELS[text(entry.engine)] ?? text(entry.engine)}
              {available(entry) ? '' : ' · unavailable on this computer'}
            </option>
          ))}
        </select>
      </Field>
      {error && (
        <p className="ew-error" role="alert">
          {error}
        </p>
      )}
      {!loading && (!choices.length || error) && (
        <Action onClick={() => setRevision((v) => v + 1)}>Retry engines</Action>
      )}
      {selected && (
        <p className="ew-muted">
          {selected.active ? 'Installed build' : 'Offered build'}:{' '}
          {text(record(selected.active ?? selected.latest).version)}. Model compatibility is checked before
          download.
        </p>
      )}
      <Action primary disabled={loading || !selected || !available(selected)} onClick={onContinue}>
        Choose models for this engine
      </Action>
    </>
  )
}
