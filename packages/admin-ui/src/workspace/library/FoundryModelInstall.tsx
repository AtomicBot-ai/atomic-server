// Lifted from Atomic-Chat/web-app/src/containers/hub/LocalModelTable.tsx @ 5043013; adapted: inline Foundry variant controls.
import { useRef, useState } from 'react'
import type { FoundryModelPlan } from '@contract'
import { acceleratorLabel, formatSize, foundryVerdictText, variantLabel } from '@view'
import { describeError } from '@/services/admin-api'
import { Action, Field } from '../Controls'
import type { Workspace } from '../useWorkspace'
import { ModelInstallFrame } from './ModelInstallFrame'

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
  embedded = false,
}: {
  workspace: Workspace
  model: FoundryModel
  onClose: () => void
  onStarted?: (id: string) => void
  onFoundry: () => void
  embedded?: boolean
}) {
  const [variant, setVariant] = useState(model.default_variant ?? model.variants[0]?.id ?? '')
  const [plan, setPlan] = useState<FoundryModelPlan | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const installRequest = useRef<{ digest: string; id: string } | null>(null)
  const v = model.variants.find((x) => x.id === variant)
  const download = async () => {
    if (!v || pending) return
    setPending(true)
    setError('')
    setPlan(null)
    try {
      const next = await w.execute<FoundryModelPlan>('foundry.plan', {
        model: model.model_id,
        variant: v.id,
      })
      setPlan(next)
      if (next.blockers.length > 0) return
      if (installRequest.current?.digest !== next.digest)
        installRequest.current = { digest: next.digest, id: `admin-${crypto.randomUUID()}` }
      const { id } = installRequest.current
      await w.execute('foundry.install', { request_id: id, plan_digest: next.digest })
      onStarted?.(id)
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
          A Microsoft catalog model: unverified by Atomic Chat (its files are checked by size only).
        </p>
      )}
      <Field label="Variant">
        <select
          aria-label="Variant"
          value={variant}
          disabled={pending}
          onChange={(e) => {
            setVariant(e.target.value)
            setPlan(null)
            setError('')
          }}
        >
          {model.variants.map((x) => (
            <option key={x.id} value={x.id}>
              {variantLabel(x)} · {x.size_bytes ? formatSize(x.size_bytes) : '?'} ·{' '}
              {foundryVerdictText(x.verdict)}
            </option>
          ))}
        </select>
      </Field>
      {v && <p>{foundryVerdictText(v.verdict)}</p>}
      {!!plan?.blockers.length && (
        <ul role="alert">
          {plan.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      <div className="ew-actions">
        {v?.verdict.verdict === 'ok' && (
          <Action primary disabled={pending} onClick={download}>
            Download
          </Action>
        )}
        {v?.verdict.verdict === 'accelerator-not-prepared' && (
          <Action primary disabled={pending} onClick={onFoundry}>
            Prepare{' '}
            {acceleratorLabel({
              name: v.verdict.accelerator ?? '',
              execution_provider: v.execution_provider,
              device: v.device,
            })}
          </Action>
        )}
        {v?.verdict.verdict === 'engine-not-installed' && (
          <Action primary disabled={pending} onClick={onFoundry}>
            Install Foundry Local
          </Action>
        )}
      </div>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
    </ModelInstallFrame>
  )
}
