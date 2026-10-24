// Lifted from Atomic-Chat/web-app/src/containers/server-concept/Setup.tsx @ 5043013; adapted: real server operations and download readiness.
import { ConnectionHelp } from './ConnectionHelp'
import { ConnectionModelPicker } from './ConnectionModelPicker'
import { ConnectionModelFields } from './ConnectionModelFields'
import { ConnectionReviewSummary } from './ConnectionReviewSummary'
import { useConnectionModel } from './useConnectionModel'
import { useConnectionRetryFocus } from './useConnectionRetryFocus'
import { DownloadGame } from '../games/DownloadGame'
import { jobOperations } from '../library/download-data'
import { AgentChoices, ConnectionChoices } from './ConnectionChoices'
import { useState } from 'react'
import { CONNECTION_AGENTS, PROFILE_AGENTS } from '@contract'
import { useConnectionStep } from './useConnectionStep'
import { useConnectionEscape } from './useConnectionEscape'
import { Action, Copy, Field } from '../Controls'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
import type { ConnectionGuideProps } from './connection-guide-types'
import { describeError } from '@/services/admin-api'
import { ConnectionHeading } from './ConnectionHeading'

export function ConnectionGuide({
  workspace: w,
  initialAgent,
  preferredModel,
  preferredProvider,
  onClose,
  onBack,
  onSettings,
  onPrepared,
  onConfigure,
}: ConnectionGuideProps) {
  const { step, setStep, heading } = useConnectionStep(initialAgent ? 'review' : 'choose')
  useConnectionEscape(onClose, step === 'preparing')
  const [path, setPath] = useState<'agent' | 'endpoint'>('agent')
  const [agent, setAgent] = useState(initialAgent ?? 'claude')
  const [more, setMore] = useState(false)
  const [pickingModel, setPickingModel] = useState(false)
  const [playing, setPlaying] = useState(false)
  const {
    models,
    modelId,
    selected,
    job,
    error: modelError,
    checking,
    retry: retryModels,
    choose,
    setProvider,
  } = useConnectionModel(w, preferredModel, preferredProvider)
  const retryFocus = useConnectionRetryFocus(checking, modelError, retryModels)
  const [port, setPort] = useState(String(w.snapshot?.api.port || 1337))
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [profile, setProfile] = useState<RecordValue | null>(null)
  const [endpoint, setEndpoint] = useState('')
  const [keyId, setKeyId] = useState('')
  const { execute } = w
  const { providers, provider: engine } = selected
  const validPort = /^\d+$/.test(port) && Number(port) > 0 && Number(port) <= 65535
  const name = CONNECTION_AGENTS.find((a) => a.id === agent)?.label ?? agent
  const configure = async () => {
    if (!selected.ready || !engine || !validPort) return
    onConfigure?.()
    setStep('preparing')
    setError('')
    try {
      setStatus('Loading model')
      await execute('models.load', { provider: engine, model_id: modelId })
      setStatus('Preparing API key')
      let keys = rows(await execute('keys.list'))
      if (!keys.length) {
        await execute('keys.create', { name: path === 'agent' ? name : 'Local endpoint' })
        keys = rows(await execute('keys.list'))
      }
      const key = text(keys[0]?.id, '')
      if (!key) throw new Error('An API key could not be prepared. Open API keys and retry.')
      setKeyId(key)
      setStatus('Starting server')
      await execute('config.update', { values: { 'api.host': '127.0.0.1', 'api.port': Number(port) } })
      await execute(w.snapshot?.api.running ? 'api.restart' : 'api.start', {
        request: { host: '127.0.0.1', port: Number(port) },
      })
      setStatus('Testing model response')
      await execute('setup.complete', { model_id: modelId })
      const info = record(await execute('connection.info'))
      setEndpoint(text(info.endpoint, `http://127.0.0.1:${port}${w.snapshot?.api.prefix ?? '/v1'}`))
      if (path === 'agent' && PROFILE_AGENTS.includes(agent)) {
        setStatus('Preparing agent connection')
        setProfile(record(await execute('connection.profile', { agent, model: modelId, key_id: key })))
      }
      await w.refresh()
      onPrepared?.(path === 'agent' ? agent : 'endpoint')
      setStep('done')
    } catch (e) {
      setError(describeError(e))
      setStep('review')
    }
  }
  const chooseAgent = (id: string) => {
    setAgent(id)
    setPath('agent')
    setStep('review')
  }
  return (
    <section ref={retryFocus.ref} className="connection-guide" aria-label="Server setup">
      <ConnectionHeading
        workspace={w}
        step={step}
        agent={path === 'agent' ? agent : undefined}
        name={name}
        heading={heading}
        onClose={onClose}
      />
      {(error || modelError) && (
        <p role="alert" className="ew-error">
          {error || modelError}
        </p>
      )}
      {modelError && (
        <Action primary ariaLabel="Retry model check" disabled={checking} onClick={retryFocus.retry}>
          Retry model check
        </Action>
      )}
      {step === 'choose' && (
        <ConnectionChoices
          choose={(value) => {
            setPath(value)
            setStep(value)
          }}
          manual={onClose}
        />
      )}
      {step === 'agent' && <AgentChoices more={more} toggle={() => setMore(!more)} select={chooseAgent} />}
      {step === 'endpoint' && (
        <>
          <div className="form-grid">
            <Field label="Access">
              <input readOnly value="This device only · 127.0.0.1" />
            </Field>
            <Field label="Server port">
              <input
                inputMode="numeric"
                value={port}
                aria-invalid={!validPort}
                onChange={(e) => setPort(e.target.value)}
              />
            </Field>
          </div>
          {!validPort && <p role="alert">Choose a port between 1 and 65535.</p>}
          <p>Enable network access later from Server configuration.</p>
        </>
      )}
      {step === 'review' && (
        <div className="server-review-grid">
          <div>
            <ConnectionModelFields
              models={models}
              model={modelId}
              engine={engine}
              providers={providers}
              status={selected.status}
              availability={checking ? 'checking' : modelError ? 'unavailable' : 'known'}
              selectModel={(id) => {
                choose(id)
                setError('')
              }}
              selectEngine={setProvider}
              browse={() => setPickingModel(true)}
            />
            {selected.waiting && <Action onClick={() => setPlaying(true)}>Play while waiting</Action>}
            {!selected.ready &&
              job &&
              /paused|cancelled|failed|interrupted/.test(text(job.stage ?? job.state, '')) && (
                <Action
                  primary
                  onClick={() => {
                    const [name, input] = jobOperations(job, text(job.id ?? job.setup_id, ''), false).resume
                    return execute(name, input)
                  }}
                >
                  Resume download
                </Action>
              )}
          </div>
          <ConnectionReviewSummary
            agent={path === 'agent' ? name : undefined}
            endpoint={`http://127.0.0.1:${port}${w.snapshot?.api.prefix ?? '/v1'}`}
            running={Boolean(w.snapshot?.api.running)}
          />
        </div>
      )}
      {step === 'preparing' && (
        <div className="connection-preparing">
          <progress aria-label="Connection setup progress" />
          <p role="status">{status}…</p>
        </div>
      )}
      {step === 'done' && (
        <>
          <p>Model: {modelId}</p>
          <div className="connect-address">
            <code>{endpoint}</code>
            <Copy value={endpoint} label="Copy endpoint" />
          </div>
          <Copy
            label="Copy API key"
            secret
            value={async () => {
              const v = await execute('keys.reveal', { id: keyId })
              return typeof v === 'string' ? v : text(record(v).token ?? record(v).key, '')
            }}
          />
          {path === 'agent' && !profile && (
            <p>
              In {name}, choose an OpenAI-compatible provider and paste this endpoint, API key, and model ID.
            </p>
          )}
          {profile && (
            <>
              <p>Run this command to launch {name} with the prepared connection.</p>
              <pre>{text(profile.launch_command ?? profile.command)}</pre>
              <Copy value={text(profile.launch_command ?? profile.command, '')} label="Copy launch command" />
            </>
          )}
          <div className="ew-actions">
            <Action
              onClick={() => {
                setStep('choose')
                setProfile(null)
              }}
            >
              Connect another tool
            </Action>
            <Action primary onClick={onClose}>
              Done
            </Action>
          </div>
        </>
      )}
      {(['agent', 'endpoint', 'review'].includes(step) || (step === 'choose' && onBack)) && (
        <div className="wizard-bottom">
          <Action
            onClick={() => (step === 'choose' ? onBack?.() : setStep(step === 'review' ? path : 'choose'))}
          >
            Back
          </Action>
          {step === 'endpoint' && (
            <Action primary disabled={!validPort} onClick={() => setStep('review')}>
              Continue
            </Action>
          )}
          {step === 'review' && (
            <Action primary disabled={!selected.ready || !engine || !validPort} onClick={configure}>
              {error ? 'Retry connection' : 'Configure & start'}
            </Action>
          )}
        </div>
      )}
      <ConnectionHelp
        disabled={step === 'preparing'}
        onSettings={onSettings}
        onModels={() => setPickingModel(true)}
      />
      {pickingModel && (
        <ConnectionModelPicker
          workspace={w}
          onClose={() => setPickingModel(false)}
          onChoose={(id, engine, job) => {
            choose(id, engine, job)
            setError('')
            setPickingModel(false)
            void w.refresh()
          }}
        />
      )}
      {playing && <DownloadGame onClose={() => setPlaying(false)} status={selected.status} />}
    </section>
  )
}
