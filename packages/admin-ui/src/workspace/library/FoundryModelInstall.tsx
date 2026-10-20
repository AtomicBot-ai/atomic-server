import { useState } from 'react'
import type { FoundryModelPlan } from '@contract'
import { acceleratorLabel, formatSize, foundryVerdictText, variantLabel } from '@view'
import { describeError } from '@/services/admin-api'
import { Action, Field } from '../Controls'
import { useDialog } from '../useDialog'
import type { Workspace } from '../useWorkspace'

interface Variant {
  id: string
  device: string
  execution_provider: string
  size_bytes: number | null
  verdict: { verdict: string; reason: string | null; accelerator: string | null }
}
interface FoundryModel {
  model_id: string
  name: string
  unverified: boolean
  default_variant: string | null
  variants: Variant[]
}

/**
 * A Foundry Local model (spec foundry-local-server): its variants for this machine with the core's
 * verdicts, the default one first chosen (NPU, then GPU, then CPU, as the server picks it); a catalog
 * model marked unverified; a variant on an unprepared accelerator, or without the engine, leads to the
 * Foundry Local panel; a runnable one downloads after its plan.
 */
export function FoundryModelInstall({
  workspace: w,
  model,
  onClose,
  onStarted,
  onFoundry,
}: {
  workspace: Workspace
  model: FoundryModel
  onClose: () => void
  onStarted?: () => void
  onFoundry: () => void
}) {
  const dialog = useDialog(onClose)
  const [variant, setVariant] = useState(model.default_variant ?? model.variants[0]?.id ?? '')
  const [plan, setPlan] = useState<FoundryModelPlan | null>(null)
  const [error, setError] = useState('')
  const v = model.variants.find((x) => x.id === variant)
  const run = (work: () => Promise<void>) => work().catch((e) => setError(describeError(e)))
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
        {model.unverified && (
          <p className="ew-muted">
            A Microsoft catalog model: unverified by Atomic Chat (its files are checked by size only).
          </p>
        )}
        {!plan ? (
          <>
            <Field label="Variant">
              <select aria-label="Variant" value={variant} onChange={(e) => setVariant(e.target.value)}>
                {model.variants.map((x) => (
                  <option key={x.id} value={x.id}>
                    {variantLabel(x)} · {x.size_bytes ? formatSize(x.size_bytes) : '?'} ·{' '}
                    {foundryVerdictText(x.verdict)}
                  </option>
                ))}
              </select>
            </Field>
            {v && <p>{foundryVerdictText(v.verdict)}</p>}
            <div className="ew-actions">
              {v?.verdict.verdict === 'ok' && (
                <Action
                  primary
                  onClick={() =>
                    run(async () =>
                      setPlan(
                        await w.execute<FoundryModelPlan>('foundry.plan', {
                          model: model.model_id,
                          variant: v.id,
                        })
                      )
                    )
                  }
                >
                  Review download
                </Action>
              )}
              {v?.verdict.verdict === 'accelerator-not-prepared' && (
                <Action onClick={onFoundry}>
                  Prepare{' '}
                  {acceleratorLabel({
                    name: v.verdict.accelerator ?? '',
                    execution_provider: v.execution_provider,
                    device: v.device,
                  })}
                </Action>
              )}
              {v?.verdict.verdict === 'engine-not-installed' && (
                <Action onClick={onFoundry}>Install Foundry Local</Action>
              )}
            </div>
          </>
        ) : (
          <>
            <p>
              {plan.variant_id} ({variantLabel(plan)}) · {formatSize(plan.download_bytes)}
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
              <Action
                primary
                disabled={plan.blockers.length > 0}
                onClick={() =>
                  run(async () => {
                    await w.execute('foundry.install', {
                      request_id: `admin-${crypto.randomUUID()}`,
                      plan_digest: plan.digest,
                    })
                    onStarted?.()
                    onClose()
                  })
                }
              >
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
