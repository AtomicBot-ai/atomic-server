// Lifted from Atomic-Chat/web-app/src/preview/onboarding/Onboarding.tsx @ 807b4d9; adapted: shared real services and browser permissions.
import { useEffect, useRef, useState } from 'react'
import { FIRST_RUN_STEPS, FIRST_RUN_TITLES } from '@contract'
import { setupFinished, setupModelPending } from '@view'
import type { FirstRunStep } from '@contract'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { record, text } from '../types'
import type { RecordValue } from '../types'
import { useDialog } from '../useDialog'
import { ModelInstall } from '../library/ModelInstall'
import { FloatingDownloads } from '../library/FloatingDownloads'
import { WorkspaceBrand } from '../WorkspaceBrand'
import { CloudProviders } from '../library/CloudProviders'
import { FirstModel } from './FirstModel'
import { Permissions, PermissionsWarning } from './Permissions'
import { Destinations } from './Purpose'
import { OptionalMedia } from './OptionalMedia'
import { WaitingSetup } from './WaitingSetup'
import './onboarding.css'
import './onboarding-model.css'

export function SetupWizard({
  workspace: w,
  onClose,
  onOpenGoal,
  onDestination,
  onWelcome,
}: {
  workspace: Workspace
  onClose: () => void
  onOpenGoal: (id: string, agent?: string) => void
  onPrepared?: (id: string) => void
  onConfigure?: () => void
  onChat?: () => void
  onWelcome?: () => void
  onDestination?: (destination: 'endpoint' | 'agents') => void
}) {
  const [step, setStep] = useState<FirstRunStep>(w.snapshot?.setups.length ? 'permissions' : 'model')
  const [waitingDestination, setWaitingDestination] = useState<'endpoint' | 'agents' | null>(null)
  const [review, setReview] = useState<RecordValue | null>(null)
  const [category, setCategory] = useState('image')
  const [mediaAdded, setMediaAdded] = useState(false)
  const [cloudConnected, setCloudConnected] = useState(false)
  const [permissionsGranted, setPermissionsGranted] = useState(false)
  const [permissionExit, setPermissionExit] = useState<'cloud' | 'chat' | null>(null)
  const [modelActionContainer, setModelActionContainer] = useState<HTMLDivElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    heading.current?.focus()
  }, [step])
  const checking = w.pending.includes('cloud.connect')
  const dialog = useDialog(() => {
    if (!checking) {
      if (waitingDestination) {
        setWaitingDestination(null)
        return
      }
      const previous = FIRST_RUN_STEPS[FIRST_RUN_STEPS.indexOf(step) - 1]
      if (previous) setStep(previous)
      else onWelcome?.()
    }
  })
  const skip = async () => {
    if (!setupFinished(w.snapshot?.setup)) await w.execute('setup.manual')
    onClose()
  }
  const leavePermissions = (destination: 'cloud' | 'chat') => {
    if (!permissionsGranted) setPermissionExit(destination)
    else if (destination === 'cloud') setStep('cloud')
    else void skip()
  }
  const next = () => setStep(FIRST_RUN_STEPS[FIRST_RUN_STEPS.indexOf(step) + 1] ?? 'connect')
  const finish = async (destination: 'endpoint' | 'agents') => {
    if (!setupFinished(w.snapshot?.setup)) await w.execute('setup.manual')
    if (onDestination) onDestination(destination)
    else onOpenGoal('api')
  }
  return (
    <div className="wizard-overlay first-run-overlay">
      <section
        ref={dialog}
        tabIndex={-1}
        className="wizard first-run"
        role="dialog"
        aria-modal="true"
        aria-label="Set up Atomic Server"
      >
        <header className="workspace-status-header">
          <WorkspaceBrand />
          <FloatingDownloads workspace={w} onboarding />
        </header>
        <main className={`first-run-content ${step === 'model' ? 'first-run-model' : ''}`}>
          {
            <h1 ref={heading} tabIndex={-1}>
              {waitingDestination
                ? setupModelPending(w.snapshot)
                  ? 'Getting your model ready'
                  : 'Your model is downloaded'
                : FIRST_RUN_TITLES[step]}
            </h1>
          }
          {waitingDestination && (
            <WaitingSetup
              workspace={w}
              onBack={() => setWaitingDestination(null)}
              onContinue={() => finish(waitingDestination)}
            />
          )}
          {!waitingDestination && step === 'model' && (
            <FirstModel
              workspace={w}
              actionContainer={modelActionContainer}
              select={async (m, installed) => {
                if (installed) {
                  await w.execute('config.update', { values: { 'tui.model': text(m.id ?? m.model_id) } })
                  next()
                } else setReview(m)
              }}
            />
          )}
          {!waitingDestination && step === 'permissions' && <Permissions onGranted={setPermissionsGranted} />}
          {!waitingDestination && step === 'cloud' && (
            <>
              <CloudProviders workspace={w} onboarding onConnected={() => setCloudConnected(true)} />
            </>
          )}
          {!waitingDestination && step === 'media' && (
            <>
              <OptionalMedia
                workspace={w}
                select={(model, kind) => {
                  setCategory(kind)
                  setReview(model)
                }}
              />
            </>
          )}
          {!waitingDestination && step === 'connect' && (
            <Destinations
              choose={async (destination) => {
                if (setupModelPending(w.snapshot)) setWaitingDestination(destination)
                else await finish(destination)
              }}
            />
          )}
        </main>
        {!waitingDestination && (
          <footer className="first-run-footer">
            {step !== 'model' || onWelcome ? (
              <Action
                disabled={checking}
                onClick={() =>
                  step === 'model'
                    ? onWelcome?.()
                    : setStep(FIRST_RUN_STEPS[FIRST_RUN_STEPS.indexOf(step) - 1])
                }
              >
                Back
              </Action>
            ) : (
              <span />
            )}
            {
              <div className="first-run-actions" ref={setModelActionContainer}>
                <span className="first-run-skip">
                  <Action
                    disabled={checking}
                    onClick={() => (step === 'permissions' ? leavePermissions('chat') : skip())}
                  >
                    Skip setup
                  </Action>
                </span>
                {['permissions', 'cloud', 'media'].includes(step) && (
                  <Action
                    primary
                    disabled={checking}
                    onClick={() => (step === 'permissions' ? leavePermissions('cloud') : next())}
                  >
                    {(
                      step === 'permissions'
                        ? permissionsGranted
                        : step === 'cloud'
                          ? cloudConnected
                          : mediaAdded
                    )
                      ? 'Continue'
                      : 'Skip'}
                  </Action>
                )}
              </div>
            }
          </footer>
        )}
        {permissionExit && (
          <PermissionsWarning
            close={() => setPermissionExit(null)}
            proceed={async () => {
              const destination = permissionExit
              setPermissionExit(null)
              if (destination === 'cloud') setStep('cloud')
              else await skip()
            }}
          />
        )}
        {review && (
          <ModelInstall
            autoStart
            model={review}
            expectedEngine={step === 'model' ? text(review.onboarding_engine, '') || undefined : undefined}
            category={step === 'media' ? category : 'text'}
            execute={w.execute}
            onClose={() => setReview(null)}
            onStarted={async (result) => {
              const job = record(result)
              if (!text(job.id ?? job.setup_id, ''))
                throw new Error('The server did not return a download ID. Open Downloads to check its state.')
              if (step === 'model') {
                const model = text(record(job.plan).model_id ?? job.model_id ?? review.id, '')
                await w.execute('config.update', { values: { 'tui.model': model } })
                next()
              } else setMediaAdded(true)
            }}
          />
        )}
      </section>
    </div>
  )
}
