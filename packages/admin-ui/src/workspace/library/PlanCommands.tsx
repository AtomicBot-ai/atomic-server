import { useEffect, useState } from 'react'
import { Copy } from '../Controls'
import type { Execute, RecordValue } from '../types'
import { record, text } from '../types'
import { describeError } from '@/services/admin-api'

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
export function PlanCommands({
  execute,
  plan,
  request,
  gguf,
  engine,
  blocked,
}: {
  execute: Execute
  plan: RecordValue
  request: RecordValue
  gguf: boolean
  engine: string
  blocked: boolean
}) {
  const [prefix, setPrefix] = useState('')
  const [error, setError] = useState('')
  const [requestId] = useState(() => crypto.randomUUID())
  useEffect(() => {
    let active = true
    void execute('config.get')
      .then((value) => {
        if (active) setPrefix(text(record(value).command_prefix, ''))
      })
      .catch((e) => {
        if (active) setError(describeError(e))
      })
    return () => {
      active = false
    }
  }, [execute])
  const install = {
    plan_digest: plan.digest ?? plan.plan_digest,
    request_id: requestId,
    ...(gguf ? { request } : {}),
  }
  const call = (name: string, input: RecordValue) =>
    `${prefix} control call ${name} --input ${quote(JSON.stringify(input))} --json`
  const commands = [
    call(gguf ? 'models.plan' : 'artifacts.plan', request),
    call(gguf ? 'models.install' : 'artifacts.install', install),
    `${prefix} control call ${gguf ? 'setup.status' : 'artifacts.list'} --json`,
    ...(gguf ? [call('models.load', { provider: engine, model_id: plan.model_id })] : []),
    `${prefix} api start`,
    `${prefix} control call api.ping --json`,
    call('setup.complete', { model_id: plan.model_id }),
  ]
  return (
    <details>
      <summary>Exact setup commands</summary>
      <p className="ew-muted">
        Run one command at a time. Inspect the plan before installing; wait for the job to be ready before
        loading. If the plan changes, review it again and use its new digest. Reuse the installation request
        ID only for this exact request. Use either these commands or the Download button for this
        installation.
      </p>
      {error && (
        <p className="ew-error" role="alert">
          {error}
        </p>
      )}
      {blocked ? (
        <p>Resolve the engine or compatibility blocker before running installation commands.</p>
      ) : (
        prefix &&
        commands.map((command, i) => (
          <div className="request-example" key={i}>
            <pre>{command}</pre>
            <Copy value={command} label={`Copy command ${i + 1}`} />
          </div>
        ))
      )}
      {!gguf && (
        <p>
          After the job is ready, load it with artifacts.load using the id returned by artifacts.list, before
          starting the API and verifying.
        </p>
      )}
    </details>
  )
}
