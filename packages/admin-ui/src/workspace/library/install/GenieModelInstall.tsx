import { useMemo, useRef, useState } from 'react'
import { Action, Field } from '../../Controls'
import type { Workspace } from '../../useWorkspace'
import { record, rows, text, type RecordValue } from '../../types'
import { formatSize } from '@view'
import { describeError } from '@/services/admin-api'
import { RuntimeModelFacts } from './RuntimeModelFacts'
import { ModelInstallFrame } from './ModelInstallFrame'
import { useVariantModel } from './use-variant-model'
import './runtime-model.css'

export function GenieModelInstall({
  workspace,
  engine = 'geniex',
  model: initialModel,
  revision = 0,
  onClose,
  onStarted,
  onEngine,
}: {
  engine?: 'geniex' | 'fastflowlm' | 'strata'
  workspace: Workspace
  model: RecordValue
  revision?: number
  onClose?: () => void
  onStarted?: (id: string, modelId: string) => void | Promise<void>
  onEngine: () => void
}) {
  const initial = useMemo<RecordValue & { model_id: string }>(
    () => ({ ...initialModel, model_id: text(initialModel.model_id, '') }),
    [initialModel]
  )
  const [retry, setRetry] = useState(0)
  const {
    model,
    checking,
    error: readError,
  } = useVariantModel(initial, engine, revision + retry, workspace.execute)
  const variants = rows(model.variants)
  const [selected, select] = useState(text(model.default_variant, text(variants[0]?.id, '')))
  const [error, setError] = useState(''),
    [pending, setPending] = useState(false)
  const request = useRef<{ digest: string; id: string } | null>(null)
  const choice = variants.find((v) => v.id === selected) ?? variants[0]
  const verdict = record(choice?.verdict)
  const metadata = engine === 'geniex' ? model : { ...model, ...choice }
  const download = async () => {
    if (!choice || pending || checking || readError) return
    setPending(true)
    setError('')
    try {
      const plan = await workspace.execute<{ digest: string; variant_id: string; blockers: string[] }>(
        `${engine}.plan`,
        engine === 'strata' ? { model: choice.id } : { model: model.model_id, variant: choice.id }
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
  const content = (
    <section className="runtime-model" aria-label="Model download">
      <div className="runtime-model-download">
        <div className="runtime-model-variant">
          {model.recommended === true && <span className="runtime-model-badge">Recommended</span>}
          {variants.length > 1 ? (
            <Field label="Variant">
              <select
                aria-label="Variant"
                value={choice ? text(choice.id) : ''}
                disabled={pending || checking}
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
        {checking || readError ? null : verdict.verdict === 'ok' ? (
          <Action primary disabled={pending} onClick={download}>
            {pending ? 'Preparing download…' : 'Download'}
          </Action>
        ) : ['engine-not-installed', 'environment-not-ready', 'requires-newer-engine'].includes(
            text(verdict.verdict)
          ) ? (
          <Action primary={Boolean(onClose)} onClick={onEngine}>
            {engine === 'fastflowlm'
              ? 'Set up FastFlowLM'
              : engine === 'strata'
                ? 'Install Strata'
                : 'Install GenieX'}
          </Action>
        ) : null}
      </div>
      {checking && (
        <p className="runtime-model-feedback" role="status">
          Checking device availability…
        </p>
      )}
      {readError && (
        <div>
          <p role="alert" className="inline-error">
            {readError}
          </p>
          <Action onClick={() => setRetry((n) => n + 1)}>Retry compatibility check</Action>
        </div>
      )}
      {!checking && !readError && verdict.verdict !== 'ok' && (
        <p className="runtime-model-feedback" role="status">
          {text(verdict.reason, text(verdict.verdict, 'No compatible variant available.'))}
        </p>
      )}
      {engine !== 'geniex' && <RuntimeModelFacts metadata={metadata} />}
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
  return onClose ? (
    <ModelInstallFrame
      title={text(model.name ?? model.model_id)}
      pending={pending}
      onClose={() => {
        if (!pending) onClose()
      }}
    >
      {content}
    </ModelInstallFrame>
  ) : (
    content
  )
}
