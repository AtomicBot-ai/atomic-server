import type { FirstRunStep } from '@contract'
import { Action } from '../Controls'

export function SetupFooter({
  step,
  disabled,
  waiting,
  actionRef,
  back,
  skip,
  next,
}: {
  step: FirstRunStep
  disabled: boolean
  waiting: { label: string; continue: () => void | Promise<unknown> } | null
  actionRef: (element: HTMLDivElement | null) => void
  back: () => void
  skip: () => Promise<void>
  next: () => void
}) {
  return (
    <footer className="first-run-footer">
      <Action disabled={disabled} onClick={back}>
        Back
      </Action>
      <div className="first-run-actions" ref={actionRef}>
        {waiting ? (
          <Action primary disabled={disabled} onClick={waiting.continue}>
            {waiting.label}
          </Action>
        ) : (
          <>
            <span className="first-run-skip">
              <Action disabled={disabled} onClick={skip}>
                {step === 'connect' ? 'Go to dashboard' : 'Skip setup'}
              </Action>
            </span>
            {['permissions', 'cloud', 'media'].includes(step) && (
              <Action primary disabled={disabled} onClick={next}>
                Continue
              </Action>
            )}
          </>
        )}
      </div>
    </footer>
  )
}
