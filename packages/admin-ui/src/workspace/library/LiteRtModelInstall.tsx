import { useState } from 'react'
import type { LiteRtModelPlan, LiteRtModelRow } from '@contract'
import { formatSize, liteRtVariantLabel, liteRtVerdictText } from '@view'
import { describeError } from '@/services/admin-api'
import { Action, Field } from '../Controls'
import { useDialog } from '../useDialog'
import type { Workspace } from '../useWorkspace'

/**
 * A LiteRT-LM model (spec litert-lm-server): its variants for this machine with the core's verdicts,
 * the default one first chosen (NPU, then GPU, then CPU, as the server picks it); a Hugging Face model
 * marked not verified, a gated one marked as needing the server's HF_TOKEN; a variant waiting on
 * openvino, or on the engine, leads to the LiteRT-LM dialog; a runnable one downloads after its plan.
 */
export function LiteRtModelInstall({
  workspace: w,
  model,
  onClose,
  onStarted,
  onEngine,
}: {
  workspace: Workspace
  model: LiteRtModelRow
  onClose: () => void
  onStarted?: (id: string) => void
  onEngine: () => void
}) {
  const dialog = useDialog(onClose)
  const [variant, setVariant] = useState(model.default_variant ?? model.variants[0]?.id ?? '')
  const [plan, setPlan] = useState<LiteRtModelPlan | null>(null)
  const [error, setError] = useState('')
  const v = model.variants.find((x) => x.id === variant)
  const run = (work: () => Promise<void>) => work().catch((e) => setError(describeError(e)))
  const review = (id: string) =>
    run(async () =>
      setPlan(await w.execute<LiteRtModelPlan>('litert.plan', { model: model.model_id, variant: id }))
    )
  const download = (p: LiteRtModelPlan) =>
    run(async () => {
      const id = `admin-${crypto.randomUUID()}`
      await w.execute('litert.install', { request_id: id, plan_digest: p.digest })
      onStarted?.(id)
      onClose()
    })
  return (
    <div className="modal-shade">
      <section
        ref={dialog}
        tabIndex={-1}
        className="ew-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Install ${model.name}`}
      >
        <div className="panel-heading">
          <h2>{model.name}</h2>
          <button className="ew-button" onClick={onClose}>
            Close
          </button>
        </div>
        {model.unverified && <p className="ew-muted">A Hugging Face model: not verified by Atomic Chat.</p>}
        {model.gated && (
          <p className="ew-muted">
            A gated model: the server needs HF_TOKEN and its terms accepted on Hugging Face.
          </p>
        )}
        {!plan ? (
          <>
            <Field label="Variant">
              <select aria-label="Variant" value={variant} onChange={(e) => setVariant(e.target.value)}>
                {model.variants.map((x) => (
                  <option key={x.id} value={x.id}>
                    {liteRtVariantLabel(x)} · {formatSize(x.file.size)} · {liteRtVerdictText(x.verdict)}
                  </option>
                ))}
              </select>
            </Field>
            {v && <p>{liteRtVerdictText(v.verdict)}</p>}
            <div className="ew-actions">
              {v?.verdict.verdict === 'ok' && (
                <Action primary onClick={() => review(v.id)}>
                  Review download
                </Action>
              )}
              {v?.verdict.verdict === 'accelerator-not-prepared' && (
                <Action onClick={onEngine}>Prepare accelerator</Action>
              )}
              {v?.verdict.verdict === 'engine-not-installed' && (
                <Action onClick={onEngine}>Install LiteRT-LM</Action>
              )}
            </div>
          </>
        ) : (
          <>
            <p>
              {plan.variant_id} ({liteRtVariantLabel(plan)}) ·{' '}
              {plan.present ? 'downloaded already' : formatSize(plan.download_bytes)}
            </p>
            {plan.blockers.length > 0 && (
              <ul role="alert">
                {plan.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            <div className="ew-actions">
              <Action onClick={() => setPlan(null)}>Back</Action>
              <Action primary disabled={plan.blockers.length > 0} onClick={() => download(plan)}>
                Download
              </Action>
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
      </section>
    </div>
  )
}
