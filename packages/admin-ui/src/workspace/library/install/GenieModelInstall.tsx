import { useRef, useState } from 'react'
import { Action, Field } from '../../Controls'
import type { Workspace } from '../../useWorkspace'
import { record, rows, text, type RecordValue } from '../../types'
import { formatSize } from '@view'
import { describeError } from '@/services/admin-api'
import { RuntimeModelFacts } from './RuntimeModelFacts'
import './runtime-model.css'

export function GenieModelInstall({
  workspace,
  engine = 'geniex',
  model,
  onStarted,
  onEngine,
}: {
  engine?: 'geniex' | 'fastflowlm'
  workspace: Workspace
  model: RecordValue
  onStarted?: (id: string, modelId: string) => void | Promise<void>
  onEngine: () => void
}) {
  const variants = rows(model.variants)
  const [selected, select] = useState(text(model.default_variant, text(variants[0]?.id, '')))
  const [error, setError] = useState(''),
    [pending, setPending] = useState(false)
  const request = useRef<{ digest: string; id: string } | null>(null)
  const choice = variants.find((v) => v.id === selected) ?? variants[0]
  const verdict = record(choice?.verdict)
  const metadata = engine === 'fastflowlm' ? { ...model, ...choice } : model
  const download = async () => {
    if (!choice || pending) return
    setPending(true)
    setError('')
    try {
      const plan = await workspace.execute<{ digest: string; variant_id: string; blockers: string[] }>(
        `${engine}.plan`,
        { model: model.model_id, variant: choice.id }
      )
      if (plan.blockers.length) throw new Error(plan.blockers.join(' '))
      if (request.current?.digest !== plan.digest)
        request.current = { digest: plan.digest, id: crypto.randomUUID() }
      const { id } = request.current
      await workspace.execute(`${engine}.install`, { request_id: id, plan_digest: plan.digest })
      await onStarted?.(id, plan.variant_id)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setPending(false)
    }
  }
  const size =
    typeof choice?.size_bytes === 'number' && choice.size_bytes > 0
      ? formatSize(choice.size_bytes)
      : 'Size unavailable'
  return (
    <section className="runtime-model" aria-label="Model download">
      <div className="runtime-model-download">
        <div className="runtime-model-variant">
          {model.recommended === true && <span className="runtime-model-badge">Recommended</span>}
          {variants.length > 1 ? (
            <Field label="Variant">
              <select
                aria-label="Variant"
                value={choice ? text(choice.id) : ''}
                disabled={pending}
                onChange={(e) => {
                  select(e.target.value)
                  setError('')
                }}
              >
                {variants.map((v) => (
                  <option key={text(v.id)} value={text(v.id)}>
                    {text(v.id)}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <div>
              <small className="ew-muted">Variant</small>
              <strong>{text(choice?.id, 'No variant available')}</strong>
            </div>
          )}
        </div>
        <div className="runtime-model-size">
          <small>Download size</small>
          <strong>{size}</strong>
        </div>
        {verdict.verdict === 'ok' ? (
          <Action primary disabled={pending} onClick={download}>
            {pending ? 'Preparing download…' : 'Download'}
          </Action>
        ) : ['engine-not-installed', 'environment-not-ready', 'requires-newer-engine'].includes(
            text(verdict.verdict)
          ) ? (
          <Action onClick={onEngine}>
            {engine === 'fastflowlm' ? 'Set up FastFlowLM' : 'Install GenieX'}
          </Action>
        ) : null}
      </div>
      {verdict.verdict !== 'ok' && (
        <p role="status">{text(verdict.reason, text(verdict.verdict, 'No compatible variant available.'))}</p>
      )}
      {engine === 'fastflowlm' && <RuntimeModelFacts metadata={metadata} />}
      {model.origin === 'qualcomm' && <p className="ew-muted">Qualcomm AI Hub</p>}
      {model.unverified === true && (
        <p className="runtime-model-source">Hugging Face · not verified by Atomic Chat</p>
      )}
      {metadata.gated === true && (
        <p>Accept the model terms on Hugging Face and set HF_TOKEN on the server.</p>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
    </section>
  )
}
