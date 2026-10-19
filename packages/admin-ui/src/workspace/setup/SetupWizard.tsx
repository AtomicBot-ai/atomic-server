import { useEffect, useRef, useState } from 'react'
import { SETUP_GOALS } from '@contract'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { ModelInstall } from '../library/ModelInstall'
import { Downloads } from '../library/Downloads'
import { SetupChoices } from './SetupChoices'
import { useDialog } from '../useDialog'
import { record, rows, text } from '../types'
import type { RecordValue } from '../types'
import { SetupReady } from './SetupReady'
import { SetupResume } from './SetupResume'
import { SetupDetails } from './SetupDetails'
import { Eye } from '../Eye'
import { describeError } from '@/services/admin-api'

export function SetupWizard({
  workspace: w,
  onClose,
  onOpenGoal,
}: {
  workspace: Workspace
  onClose: () => void
  onOpenGoal: (id: string) => void
}) {
  const [step, setStep] = useState(0)
  const [method, setMethod] = useState('guided')
  const [engine, setEngine] = useState('')
  const [engineConfirmed, setEngineConfirmed] = useState(false)
  const [goal, setGoal] = useState('chat')
  const selectedGoal = SETUP_GOALS.find((item) => item.id === goal) ?? SETUP_GOALS[0]
  const category = selectedGoal.category
  const [models, setModels] = useState<RecordValue[]>([])
  const [choice, setChoice] = useState('')
  const [query, setQuery] = useState('')
  const [revision, setRevision] = useState(0)
  const [review, setReview] = useState<RecordValue | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [access, setAccess] = useState('local')
  const [target, setTarget] = useState('')
  const [verifying, setVerifying] = useState(false)
  const attempted = useRef('')
  const dialog = useDialog(onClose)
  const progress = step === 0 ? (engineConfirmed ? 1 : 0) : step + 1
  const { execute } = w
  useEffect(() => {
    if (!engineConfirmed || step !== 0) return
    let active = true
    setLoading(true)
    setError('')
    setModels([])
    setChoice('')
    void execute('models.catalog', { category })
      .then((result) => {
        if (active) setModels(rows(result))
      })
      .catch((e) => {
        if (active) setError(describeError(e))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [category, execute, revision, engineConfirmed, step])
  const targetJob = w.snapshot?.setups.map(record).find((job) => (job.id ?? job.setup_id) === target)
  const recoverable = w.snapshot?.setups.map(record).filter((job) => job.id || job.setup_id) ?? []
  const verify = async () => {
    if (!targetJob || targetJob.stage !== 'ready') return
    setVerifying(true)
    setError('')
    try {
      const plan = record(targetJob.plan)
      if (!plan.model_id) throw new Error('The selected download has no model ID. Check Downloads.')
      await execute(
        plan.category ? 'artifacts.load' : 'models.load',
        plan.category ? { id: target } : { provider: engine || plan.provider, model_id: plan.model_id }
      )
      const config = record(record(await execute('config.get')).values)
      const api = record(config.api)
      const host =
        access === 'saved' ? text(api.host, '127.0.0.1') : access === 'lan' ? '0.0.0.0' : '127.0.0.1'
      if (
        !w.snapshot?.api.running ||
        w.snapshot.api.host !== host ||
        w.snapshot.api.port !== api.port ||
        w.snapshot.api.prefix !== api.prefix
      )
        await execute(w.snapshot?.api.running ? 'api.restart' : 'api.start', { request: { host } })
      await execute('setup.complete', { model_id: plan.model_id })
      setStep(3)
    } catch (e) {
      setError(describeError(e))
    } finally {
      setVerifying(false)
    }
  }
  useEffect(() => {
    if (!targetJob || targetJob.stage !== 'ready' || attempted.current === target || step !== 2) return
    attempted.current = target
    void verify()
    // A durable job is verified once; explicit Retry is available after a failure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetJob?.stage, target, step])
  const manual = async () => {
    await execute('setup.manual')
    onClose()
  }
  return (
    <div className="wizard-overlay">
      <section
        ref={dialog}
        tabIndex={-1}
        className="wizard"
        role="dialog"
        aria-modal="true"
        aria-label="Set up Atomic Server"
      >
        <div className="wizard-top">
          <strong>ATOMIC SERVER</strong>
          <button className="ew-button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="wizard-title">
          <Eye state={step === 2 ? 'starting' : step === 3 ? 'ready' : 'stopped'} />
          <div>
            <h1>
              {step === 0
                ? 'Set up your server'
                : step === 2
                  ? 'Preparing your model'
                  : step === 3
                    ? 'Your model is ready'
                    : 'Review download'}
            </h1>
            <ol className="wizard-steps">
              {['Engine', 'Model', 'Review', 'Prepare', 'Ready'].map((label, i) => (
                <li
                  key={label}
                  className={i === progress ? 'current' : i < progress ? 'done' : ''}
                  aria-current={i === progress ? 'step' : undefined}
                >
                  {i + 1} {label}
                </li>
              ))}
            </ol>
          </div>
        </div>
        {step === 0 && (
          <nav className="subnav" aria-label="Setup method">
            <button
              className={method === 'guided' ? 'active' : ''}
              onClick={() => {
                setMethod('guided')
                if (goal !== 'chat') {
                  setGoal('chat')
                  setEngine('')
                  setEngineConfirmed(false)
                  setChoice('')
                  setQuery('')
                }
              }}
            >
              Power my agent
            </button>
            <button className={method === 'technical' ? 'active' : ''} onClick={() => setMethod('technical')}>
              Configure with commands
            </button>
          </nav>
        )}
        {error && (
          <p className="ew-error" role="alert">
            {error}
          </p>
        )}
        {step === 0 ? (
          <>
            {method === 'technical' && (
              <SetupDetails workspace={w} engine={engine} expanded onConfigSaved={() => setAccess('saved')} />
            )}
            <SetupResume
              jobs={recoverable}
              onResume={(job) => {
                const plan = record(job.plan)
                const matching = SETUP_GOALS.find((item) => item.category === (plan.category ?? 'text'))
                if (matching && selectedGoal.category !== matching.category) setGoal(matching.id)
                setEngine(text(plan.provider ?? plan.engine, ''))
                attempted.current = ''
                setTarget(text(job.id ?? job.setup_id, ''))
                setStep(2)
              }}
            />
            <SetupChoices
              workspace={w}
              technical={method === 'technical'}
              engine={engine}
              setEngine={(id) => {
                setEngine(id)
                setEngineConfirmed(false)
                setChoice('')
                setQuery('')
              }}
              engineConfirmed={engineConfirmed}
              confirmEngine={() => setEngineConfirmed(true)}
              backToEngine={() => {
                setEngineConfirmed(false)
                setChoice('')
              }}
              goal={goal}
              setGoal={(id) => {
                setGoal(id)
                setEngine('')
                setEngineConfirmed(false)
                setQuery('')
                setChoice('')
              }}
              models={models}
              choice={choice}
              setChoice={setChoice}
              query={query}
              setQuery={(value) => {
                setQuery(value)
                setChoice('')
              }}
              loading={loading}
              retry={() => setRevision((v) => v + 1)}
              access={access}
              setAccess={setAccess}
              continueSetup={() => {
                setReview(models.find((model) => model.id === choice) ?? null)
                setStep(1)
              }}
              manual={manual}
            />
          </>
        ) : step === 1 ? (
          <p className="ew-muted">Review the selected model before starting the download.</p>
        ) : step === 2 ? (
          <>
            <Downloads workspace={w} />
            <p className="setup-guidance">
              {verifying
                ? 'Loading your selected model and testing real inference…'
                : 'Downloads continue when you close this page. Reopen setup to continue this job.'}
            </p>
            <div className="wizard-bottom">
              <Action primary disabled={verifying || targetJob?.stage !== 'ready'} onClick={verify}>
                Retry verification
              </Action>
              <Action
                disabled={verifying}
                onClick={() => {
                  setStep(0)
                  setTarget('')
                  setError('')
                }}
              >
                Choose another model
              </Action>
              <Action disabled={verifying} onClick={manual}>
                Continue manually
              </Action>
            </div>
          </>
        ) : (
          <SetupReady goal={goal} endpoint={w.snapshot?.api.endpoint ?? ''} onOpenGoal={onOpenGoal} />
        )}
        {review && (
          <ModelInstall
            model={review}
            category={category}
            expectedEngine={engine}
            technical={method === 'technical'}
            execute={execute}
            onClose={() => {
              setReview(null)
              setStep((current) => (current === 1 ? 0 : current))
            }}
            onStarted={(result) => {
              const job = record(result)
              attempted.current = ''
              setTarget(text(job.id ?? job.setup_id, ''))
              setStep(2)
            }}
          />
        )}
      </section>
    </div>
  )
}
