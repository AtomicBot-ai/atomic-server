import { useRef, useState } from 'react'
import { Action, Field } from '../../Controls'
import type { Workspace } from '../../useWorkspace'
import { record, rows, text, type RecordValue } from '../../types'
import { formatSize } from '@view'
import { describeError } from '@/services/admin-api'

export function GenieModelInstall({
  workspace,
  model,
  onStarted,
  onEngine,
}: {
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
  const download = async () => {
    if (!choice || pending) return
    setPending(true)
    setError('')
    try {
      const plan = await workspace.execute<{ digest: string; variant_id: string; blockers: string[] }>(
        'geniex.plan',
        { model: model.model_id, variant: choice.id }
      )
      if (plan.blockers.length) throw new Error(plan.blockers.join(' '))
      if (request.current?.digest !== plan.digest)
        request.current = { digest: plan.digest, id: crypto.randomUUID() }
      const { id } = request.current
      await workspace.execute('geniex.install', { request_id: id, plan_digest: plan.digest })
      await onStarted?.(id, plan.variant_id)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setPending(false)
    }
  }
  return (
    <>
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
              {text(v.id)} · {formatSize(Number(v.size_bytes))}
            </option>
          ))}
        </select>
      </Field>
      {model.origin === 'qualcomm' && <p>Qualcomm AI Hub</p>}
      {model.unverified === true && <p>Hugging Face · not verified by Atomic Chat</p>}
      {model.gated === true && <p>Accept the model terms on Hugging Face and set HF_TOKEN on the server.</p>}
      {verdict.verdict === 'ok' ? (
        <Action primary disabled={pending} onClick={download}>
          Download
        </Action>
      ) : (
        <>
          <p>{text(verdict.reason, text(verdict.verdict, ''))}</p>
          {verdict.verdict === 'engine-not-installed' && <Action onClick={onEngine}>Install GenieX</Action>}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  )
}
