import { useEffect, useState } from 'react'
import { SETUP_GOALS } from '@contract'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { Downloads } from '../library/Downloads'
import { SetupChoices } from './SetupChoices'
import { useDialog } from '../useDialog'
import { record, text } from '../types'
import type { RecordValue } from '../types'
import { SetupIntent } from './SetupIntent'
import { SetupReady } from './SetupReady'
import { SetupResume } from './SetupResume'
import { SetupDetails } from './SetupDetails'
import { useSetupVerify } from './useSetupVerify'
import { SetupReview } from './SetupReview'
import { SetupEngineInstall } from './SetupEngineInstall'
import { engineDialog, setupModels } from './setup-data'
import { useEngines } from '../useEngines'
import { describeError } from '@/services/admin-api'

export function AdvancedSetupWizard({
  workspace: w,
  onClose,
  onOpenGoal,
}: {
  workspace: Workspace
  onClose: () => void
  onOpenGoal: (id: string, agent?: string) => void
}) {
  const [step, setStep] = useState(-1)
  const [agent, setAgent] = useState('atomic-agent')
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
  const [enginesRevision, setEnginesRevision] = useState(0)
  const installed = useEngines(w.execute, enginesRevision)
    .engines.filter((e) => e.active)
    .map((e) => text(e.engine))
  const dialog = useDialog(onClose)
  const { execute } = w
  useEffect(() => {
    if (!engineConfirmed || step !== 0) return
    let active = true
    setLoading(true)
    setError('')
    setModels([])
    setChoice('')
    void setupModels(execute, engine, category)
      .then((result) => {
        if (active) setModels(result)
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
  }, [category, execute, revision, engineConfirmed, step, engine])
  const recoverable = w.snapshot?.setups.map(record).filter((job) => job.id || job.setup_id) ?? []
  const { verify, verifying, targetJob, attempted } = useSetupVerify({
    workspace: w,
    target,
    engine,
    access,
    step,
    setStep,
    setError,
  })
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
        <h1>Advanced model setup</h1>
        {step === 0 && (
          <div className="ew-actions">
            <Action onClick={() => setStep(-1)}>Back to connection</Action>
            <span className="ew-muted">{selectedGoal.label}</span>
          </div>
        )}
        {error && (
          <p className="ew-error" role="alert">
            {error}
          </p>
        )}
        {step < 0 ? (
          <SetupIntent
            goal={goal}
            setGoal={(id) => {
              setGoal(id)
              setEngine('')
              setEngineConfirmed(false)
              setChoice('')
              setQuery('')
            }}
            agent={agent}
            setAgent={setAgent}
            technical={method === 'technical'}
            setTechnical={(value) => setMethod(value ? 'technical' : 'guided')}
            onContinue={() => setStep(0)}
            onManual={manual}
          />
        ) : step === 0 ? (
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
            {engineConfirmed && engineDialog(engine) && !installed.includes(engine) ? (
              <SetupEngineInstall
                workspace={w}
                engine={engine}
                onDone={() => setEnginesRevision((v) => v + 1)}
              />
            ) : null}
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
          <SetupReady
            goal={goal}
            endpoint={w.snapshot?.api.endpoint ?? ''}
            onOpenGoal={(id) => onOpenGoal(id, agent)}
          />
        )}
        {review && (
          <SetupReview
            workspace={w}
            model={review}
            category={category}
            engine={engine}
            technical={method === 'technical'}
            onClose={() => {
              setReview(null)
              setStep((current) => (current === 1 ? 0 : current))
            }}
            onStarted={(id) => {
              attempted.current = ''
              setTarget(id)
              setStep(2)
            }}
            onEngine={(id) => {
              // The engine that would take the model: chosen, and its install shown in the wizard.
              setReview(null)
              setStep(0)
              setEngine(id)
              setChoice('')
              setQuery('')
              setEngineConfirmed(true)
            }}
          />
        )}
      </section>
    </div>
  )
}
