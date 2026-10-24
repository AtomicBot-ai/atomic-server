import { useRef, useState } from 'react'
import type { LiteRtModelPlan, LiteRtModelRow } from '@contract'
import { formatSize, liteRtVariantLabel, liteRtVerdictText } from '@view'
import { describeError } from '@/services/admin-api'
import { Action, Field } from '../Controls'
import type { Workspace } from '../useWorkspace'
import { ModelInstallFrame } from './ModelInstallFrame'

/**
 * A LiteRT-LM model (spec litert-lm-server): its variants for this machine with the core's verdicts,
 * the default one first chosen (NPU, then GPU, then CPU, as the server picks it); a Hugging Face model
 * marked not verified, a gated one marked as needing the server's HF_TOKEN; a variant waiting on
 * openvino, or on the engine, leads to the LiteRT-LM dialog; a runnable one downloads after its plan,
 * and a retry of the same plan continues the same request.
 */
export function LiteRtModelInstall({
  workspace: w,
  model,
  onClose,
  onStarted,
  onEngine,
  embedded = false,
}: {
  workspace: Workspace
  model: LiteRtModelRow
  onClose: () => void
  /** The request's id, and the variant's id: what loads once the download is done. */
  onStarted?: (id: string, variant: string) => void | Promise<void>
  onEngine: () => void
  embedded?: boolean
}) {
  const [variant, setVariant] = useState(model.default_variant ?? model.variants[0]?.id ?? '')
  const [plan, setPlan] = useState<LiteRtModelPlan | null>(null)
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
      const next = await w.execute<LiteRtModelPlan>('litert.plan', { model: model.model_id, variant: v.id })
      setPlan(next)
      if (next.blockers.length > 0) return
      if (installRequest.current?.digest !== next.digest)
        installRequest.current = { digest: next.digest, id: `admin-${crypto.randomUUID()}` }
      const { id } = installRequest.current
      await w.execute('litert.install', { request_id: id, plan_digest: next.digest })
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
      {model.unverified && <p className="ew-muted">A Hugging Face model: not verified by Atomic Chat.</p>}
      {model.gated && (
        <p className="ew-muted">
          A gated model: the server needs HF_TOKEN and its terms accepted on Hugging Face.
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
              {liteRtVariantLabel(x)} · {formatSize(x.file.size)} · {liteRtVerdictText(x.verdict)}
            </option>
          ))}
        </select>
      </Field>
      {v && <p>{liteRtVerdictText(v.verdict)}</p>}
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
          <Action primary disabled={pending} onClick={onEngine}>
            Prepare accelerator
          </Action>
        )}
        {v?.verdict.verdict === 'engine-not-installed' && (
          <Action primary disabled={pending} onClick={onEngine}>
            Install LiteRT-LM
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
