// Lifted from Atomic-Chat/web-app/src/containers/hub/LocalModelTable.tsx @ 5043013; adapted: inline Foundry variant controls.
import { useRef, useState } from 'react'
import type { FoundryModelPlan } from '@contract'
import { acceleratorLabel, variantLabel } from '@view'
import { describeError } from '@/services/admin-api'
import { Action } from '../../Controls'
import type { Workspace } from '../../useWorkspace'
import { ModelInstallFrame } from './ModelInstallFrame'
import { VariantChoices } from './VariantChoices'
import { useVariantModel } from './use-variant-model'

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
  model: initialModel,
  revision = 0,
  onClose,
  onStarted,
  onFoundry,
  embedded = false,
}: {
  workspace: Workspace
  model: FoundryModel
  revision?: number
  onClose: () => void
  /** The request's id, and the variant's id: what loads once the download is done. */
  onStarted?: (id: string, variant: string) => void | Promise<void>
  onFoundry: () => void
  embedded?: boolean
}) {
  const {
    model,
    checking,
    error: readError,
  } = useVariantModel(initialModel, 'foundry-local', revision, w.execute)
  const [variant, setVariant] = useState(model.default_variant ?? model.variants[0]?.id ?? '')
  const [review, setReview] = useState<{ revision: number; plan: FoundryModelPlan } | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const installRequest = useRef<{ digest: string; id: string } | null>(null)
  const v = model.variants.find((x) => x.id === variant)
  const plan = review?.revision === revision ? review.plan : null
  const verdict = plan?.verdict?.verdict ?? v?.verdict.verdict
  const reviewRequirement = !plan && verdict === 'engine-update-required'
  const download = async () => {
    if (!v || pending || checking) return
    setPending(true)
    setError('')
    setReview(null)
    try {
      const next = await w.execute<FoundryModelPlan>('foundry.plan', {
        model: model.model_id,
        variant: v.id,
      })
      setReview({ revision, plan: next })
      if (next.blockers.length > 0) return
      if (installRequest.current?.digest !== next.digest)
        installRequest.current = { digest: next.digest, id: `admin-${crypto.randomUUID()}` }
      const { id } = installRequest.current
      await w.execute('foundry.install', { request_id: id, plan_digest: next.digest })
      await onStarted?.(id, next.variant_id)
      onClose()
    } catch (e) {
      setError(describeError(e))
    } finally {
      setPending(false)
    }
  }
  return (
    <ModelInstallFrame
      embedded={embedded}
      pending={pending}
      title={model.name}
      onClose={() => {
        if (!pending) onClose()
      }}
    >
      {model.unverified && (
        <p className="ew-muted">
          From the Microsoft catalog. File sizes are checked; checksums are not available.
        </p>
      )}
      {checking && <p role="status">Checking device availability…</p>}
      <VariantChoices
        name={`foundry-variant-${model.model_id}`}
        choices={model.variants.map((x) => ({ ...x, label: variantLabel(x), size: x.size_bytes }))}
        value={variant}
        disabled={pending || checking}
        onChange={(id) => {
          setVariant(id)
          setReview(null)
          setError('')
        }}
      />
      {!!plan?.blockers.length && (
        <ul role="alert">
          {plan.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      <div className="ew-actions">
        {(verdict === 'ok' || reviewRequirement) && (
          <Action primary disabled={pending || checking} onClick={download}>
            {reviewRequirement ? 'Check runtime requirement' : 'Download'}
          </Action>
        )}
        {plan?.update_available && (
          <Action primary disabled={pending || checking} onClick={onFoundry}>
            Update Foundry Local
          </Action>
        )}
        {v && verdict === 'accelerator-not-prepared' && (
          <Action primary disabled={pending} onClick={onFoundry}>
            Prepare{' '}
            {acceleratorLabel({
              name: plan?.verdict.accelerator ?? v.verdict.accelerator ?? '',
              execution_provider: v.execution_provider,
              device: v.device,
            })}
          </Action>
        )}
        {verdict === 'engine-not-installed' && (
          <Action primary disabled={pending} onClick={onFoundry}>
            Install Foundry Local
          </Action>
        )}
      </div>
      {(error || readError) && (
        <p role="alert" className="inline-error">
          {error || readError}
        </p>
      )}
    </ModelInstallFrame>
  )
}
