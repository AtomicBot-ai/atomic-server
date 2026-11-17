// Lifted from Atomic-Chat/web-app/src/preview/onboarding/Onboarding.tsx @ 807b4d9; adapted: shared real services and browser permissions.
import { useEffect, useRef, useState } from 'react'
import { FIRST_RUN_STEPS, FIRST_RUN_TITLES } from '@contract'
import { setupFinished, setupDownloadsPending } from '@view'
import type { FirstRunStep, WorkspaceSnapshot } from '@contract'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { record, text } from '../types'
import type { RecordValue } from '../types'
import { useDialog } from '../useDialog'
import { ModelInstall } from '../library/install/ModelInstall'
import { SetupEngineDialog } from './SetupEngineDialog'
import { EngineChooser } from '../intro/EngineChooser'
import { SetupReview } from './SetupReview'
import { FloatingDownloads } from '../library/downloads/FloatingDownloads'
import { WorkspaceBrand } from '../WorkspaceBrand'
import { CloudProviders } from '../library/cloud/CloudProviders'
import { FirstModel } from './FirstModel'
import { Permissions } from './Permissions'
import { Destinations } from './Purpose'
import { OptionalMedia } from './OptionalMedia'
import { WaitingSetup } from './WaitingSetup'
import { ConnectionGuide } from '../server/connection/ConnectionGuide'
import { SetupFooter } from './SetupFooter'
import './onboarding.css'

const SETUP_STEP_LABELS: Record<FirstRunStep, string> = {
  model: 'Local model',
  permissions: 'Permissions',
  cloud: 'Remote providers',
  media: 'Media models',
  connect: 'Connection',
}
type Destination = 'endpoint' | 'agents'
type Waiting = {
  destination: Destination
  snapshot: WorkspaceSnapshot | null
  previous: WorkspaceSnapshot | null
}

export function SetupWizard({
  workspace: w,
  onClose,
  onOpenGoal,
  onDestination,
  onPrepared,
  onConfigure,
}: {
  workspace: Workspace
  onClose: () => void
  onOpenGoal: (id: string, agent?: string) => void
  onPrepared?: (id: string) => void
  onConfigure?: () => void
  onDestination?: (destination: Destination) => void
}) {
  const [step, setStep] = useState<FirstRunStep>(w.snapshot?.setups.length ? 'permissions' : 'model')
  const [waiting, setWaiting] = useState<Waiting | null>(null)
  // Use the refresh result until the workspace publishes its next snapshot.
  const waitingSnapshot = waiting && w.snapshot === waiting.previous ? waiting.snapshot : w.snapshot
  const waitingPending = !waitingSnapshot || setupDownloadsPending(waitingSnapshot)
  const [modelChoice, setModelChoice] = useState('')
  const [review, setReview] = useState<RecordValue | null>(null)
  const [engineDialog, setEngineDialog] = useState('')
  const [choosingEngine, setChoosingEngine] = useState(false)
  const [engineRevision, setEngineRevision] = useState(0)
  const [agentSetup, setAgentSetup] = useState(false)
  const [category, setCategory] = useState('image')
  const [modelActionContainer, setModelActionContainer] = useState<HTMLDivElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const content = useRef<HTMLElement>(null)
  useEffect(() => {
    if (content.current) content.current.scrollTop = 0
    heading.current?.focus({ preventScroll: true })
  }, [step, waiting, agentSetup])
  const finishing = w.pending.includes('setup.manual')
  const checking = finishing || w.pending.includes('cloud.connect')
  const dialog = useDialog(
    () => {
      if (!checking && !agentSetup) {
        if (waiting) {
          setWaiting(null)
          return
        }
        const previous = FIRST_RUN_STEPS[FIRST_RUN_STEPS.indexOf(step) - 1]
        if (previous) setStep(previous)
        else setChoosingEngine(true)
      }
    },
    true,
    { dismissOnOutside: false }
  )
  const openDashboard = async (restoreSelected: boolean) => {
    if (!setupFinished(w.snapshot?.setup))
      await w.execute('setup.manual', { restore_selected: restoreSelected })
    onClose()
  }
  const skip = async () => {
    const snapshot = (await w.refresh()) ?? w.snapshot
    if (setupDownloadsPending(snapshot)) {
      setStep('connect')
      setWaiting({ destination: 'endpoint', snapshot, previous: w.snapshot })
      return
    }
    await openDashboard(true)
  }
  const next = () => setStep(FIRST_RUN_STEPS[FIRST_RUN_STEPS.indexOf(step) + 1] ?? 'connect')
  const finish = async (destination: Destination) => {
    if (!setupFinished(w.snapshot?.setup)) await w.execute('setup.manual')
    if (onDestination) onDestination(destination)
    else onOpenGoal('api')
  }
  const continueTo = (destination: Destination) => {
    if (destination === 'endpoint') return finish(destination)
    setWaiting(null)
    setAgentSetup(true)
  }
  return (
    <div className="wizard-overlay first-run-overlay">
      <section
        ref={dialog}
        tabIndex={-1}
        className="wizard first-run"
        hidden={choosingEngine}
        role="dialog"
        aria-modal="true"
        aria-label="Set up Atomic Server"
      >
        <header className="workspace-status-header desktop-topbar">
          <WorkspaceBrand />
          <FloatingDownloads workspace={w} />
        </header>
        {finishing && <p role="status">Preparing your server…</p>}
        <div className="first-run-body">
          <ol className="first-run-steps" aria-label="Setup steps">
            {FIRST_RUN_STEPS.map((item) => (
              <li key={item} aria-current={item === step ? 'step' : undefined}>
                {SETUP_STEP_LABELS[item]}
              </li>
            ))}
          </ol>
          <main ref={content} className="first-run-content">
            {!agentSetup && (
              <h1 ref={heading} tabIndex={-1}>
                {waiting
                  ? waitingPending
                    ? 'Getting your model ready'
                    : 'Your model is downloaded'
                  : FIRST_RUN_TITLES[step]}
              </h1>
            )}
            {waiting && <WaitingSetup workspace={{ ...w, snapshot: waitingSnapshot }} />}
            {!waiting && step === 'model' && (
              <FirstModel
                key={engineRevision}
                workspace={w}
                initialChoice={modelChoice}
                onChoice={setModelChoice}
                actionContainer={modelActionContainer}
                select={async (m, installed) => {
                  if (installed) {
                    await w.execute('config.update', { values: { 'tui.model': text(m.id ?? m.model_id) } })
                    next()
                  } else setReview(m)
                }}
              />
            )}
            {!waiting && step === 'permissions' && <Permissions />}
            {!waiting && step === 'cloud' && (
              <>
                <p className="ew-muted setup-step-description">
                  Connect a provider to use its models. You can also do this later from the Catalog.
                </p>
                <CloudProviders workspace={w} />
              </>
            )}
            {!waiting && step === 'media' && (
              <>
                <p className="ew-muted setup-step-description">
                  Optionally queue a model for image or video generation.
                </p>
                <OptionalMedia
                  workspace={w}
                  select={(model, kind) => {
                    setCategory(kind)
                    setReview(model)
                  }}
                />
              </>
            )}
            {!waiting && !agentSetup && step === 'connect' && w.error && (
              <Action onClick={() => setStep('model')}>Choose another model</Action>
            )}
            {agentSetup ? (
              <ConnectionGuide
                workspace={w}
                onboarding
                onConfigure={onConfigure}
                onPrepared={onPrepared}
                onClose={() => setAgentSetup(false)}
                onDone={onClose}
              />
            ) : (
              !waiting &&
              step === 'connect' && (
                <Destinations
                  refresh={() => w.refresh()}
                  choose={(destination, snapshot) => {
                    if (setupDownloadsPending(snapshot))
                      setWaiting({ destination, snapshot, previous: w.snapshot })
                    else return continueTo(destination)
                  }}
                />
              )
            )}
          </main>
        </div>
        {!agentSetup && (
          <SetupFooter
            step={step}
            disabled={checking}
            actionRef={setModelActionContainer}
            back={() => {
              if (waiting) setWaiting(null)
              else if (step === 'model') setChoosingEngine(true)
              else setStep(FIRST_RUN_STEPS[FIRST_RUN_STEPS.indexOf(step) - 1])
            }}
            waiting={
              waiting && {
                label: waitingPending ? 'Open control panel' : 'Continue',
                continue: () => (waitingPending ? finish : continueTo)(waiting.destination),
              }
            }
            skip={step === 'connect' ? () => openDashboard(false) : skip}
            next={next}
          />
        )}
        {review && step === 'model' && (
          <SetupReview
            revision={engineRevision}
            autoStart
            workspace={w}
            model={review}
            category="text"
            engine={text(review.onboarding_engine, '')}
            technical={false}
            onClose={() => setReview(null)}
            onStarted={async (id, model) => {
              if (!id)
                throw new Error('The server did not return a download ID. Open Downloads to check its state.')
              await w.execute('config.update', { values: { 'tui.model': model } })
              // The next step unmounts the review before it closes itself: a media step must not inherit it.
              setReview(null)
              next()
            }}
            onEngine={setEngineDialog}
          />
        )}
        {review && step === 'media' && (
          <ModelInstall
            autoStart
            model={review}
            category={category}
            execute={w.execute}
            onClose={() => setReview(null)}
            onStarted={(result) => {
              if (!text(record(result).id ?? record(result).setup_id, ''))
                throw new Error('The server did not return a download ID. Open Downloads to check its state.')
            }}
          />
        )}
        {engineDialog && (
          <SetupEngineDialog
            workspace={w}
            engine={engineDialog}
            onClose={() => {
              setEngineDialog('')
              setEngineRevision((v) => v + 1)
            }}
          />
        )}
      </section>
      {choosingEngine && (
        <EngineChooser
          workspace={w}
          onBack={() => setChoosingEngine(false)}
          onContinue={() => {
            setChoosingEngine(false)
            setEngineRevision((v) => v + 1)
          }}
        />
      )}
    </div>
  )
}
