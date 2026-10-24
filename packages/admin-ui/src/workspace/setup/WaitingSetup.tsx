import { useEffect, useState } from 'react'
import { connectionDownload, setupModelPending } from '@view'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { DownloadGame } from '../games/DownloadGame'
import './waiting-setup.css'

type EmailStatus = 'idle' | 'invalid' | 'confirming' | 'confirmed'

export function WaitingSetup({
  workspace,
  onBack,
  onContinue,
}: {
  workspace: Workspace
  onBack: () => void
  onContinue: () => void | Promise<unknown>
}) {
  const [email, setEmail] = useState(''),
    [emailStatus, setEmailStatus] = useState<EmailStatus>('idle')
  // Local mock only. The notification service is a separate, explicitly deferred PR requirement.
  useEffect(() => {
    if (emailStatus !== 'confirming') return
    const timer = setTimeout(() => setEmailStatus('confirmed'), 400)
    return () => clearTimeout(timer)
  }, [emailStatus])
  const pending = setupModelPending(workspace.snapshot)
  const job = connectionDownload(workspace.snapshot?.setups ?? [])
  const stopped = /paused|cancelled|failed|interrupted/.test(String(job?.stage ?? job?.state ?? ''))
  return (
    <div className="waiting-setup">
      <p role="status">
        {stopped
          ? 'The download is stopped. Open Downloads to resume it.'
          : pending
            ? 'Keep playing or continue while your model downloads.'
            : 'Your model is downloaded. Continue to finish setup.'}
      </p>
      <div className="waiting-setup-grid">
        <DownloadGame inline onClose={() => {}} />
        <div className="waiting-side">
          <form
            className="waiting-email"
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              if (emailStatus === 'confirming' || emailStatus === 'confirmed') return
              setEmailStatus(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'confirming' : 'invalid')
            }}
          >
            <label htmlFor="setup-email">Email me when it is ready</label>
            <div className="waiting-email-controls">
              <input
                id="setup-email"
                type="email"
                autoComplete="email"
                value={email}
                readOnly={emailStatus === 'confirming'}
                aria-invalid={emailStatus === 'invalid' || undefined}
                aria-describedby="setup-email-status"
                onChange={(event) => {
                  setEmail(event.target.value)
                  setEmailStatus('idle')
                }}
                placeholder="you@example.com"
              />
              <button
                className="ew-button primary"
                type="submit"
                aria-busy={emailStatus === 'confirming' || undefined}
                disabled={!email.trim() || emailStatus === 'confirming' || emailStatus === 'confirmed'}
              >
                {emailStatus === 'confirming'
                  ? 'Saving…'
                  : emailStatus === 'confirmed'
                    ? 'Confirmed'
                    : 'Confirm'}
              </button>
            </div>
            <span
              id="setup-email-status"
              className={`waiting-email-status ${emailStatus}`}
              role={emailStatus === 'invalid' ? 'alert' : 'status'}
            >
              {emailStatus === 'invalid'
                ? 'Enter a valid email address.'
                : emailStatus === 'confirmed'
                  ? 'Email saved'
                  : ''}
            </span>
          </form>
        </div>
        <div className="waiting-actions">
          <Action onClick={onBack}>Back</Action>
          <Action primary onClick={onContinue}>
            {pending ? "I can't wait - take me to the control panel" : 'Continue'}
          </Action>
        </div>
      </div>
    </div>
  )
}
