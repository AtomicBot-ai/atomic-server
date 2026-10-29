import { useState } from 'react'
import { connectionDownload, downloadStopped, reminderSet, setupModelPending } from '@view'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { DownloadGame } from '../games/DownloadGame'
import { describeError } from '@/services/admin-api'
import './waiting-setup.css'

type EmailStatus = 'idle' | 'invalid' | 'saving' | 'failed'

/**
 * The connection's last wait: a game while the model downloads, and the model-ready email. The server
 * registers the address and sends the email itself once the download is done (`setup.reminder`), so it
 * arrives with this page closed; the address stays in this form, the server keeps only a token.
 */
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
    [emailStatus, setEmailStatus] = useState<EmailStatus>('idle'),
    [emailError, setEmailError] = useState('')
  const pending = setupModelPending(workspace.snapshot)
  const job = connectionDownload(workspace.snapshot?.setups ?? [])
  const stopped = downloadStopped(String(job?.stage ?? job?.state ?? ''))
  const saving = emailStatus === 'saving'
  const reminded = !email && reminderSet(workspace.snapshot)
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
          {pending && (
            <form
              className="waiting-email"
              noValidate
              onSubmit={async (event) => {
                event.preventDefault()
                if (saving) return
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
                  setEmailStatus('invalid')
                  return
                }
                setEmailStatus('saving')
                try {
                  await workspace.execute('setup.reminder', { email: email.trim() })
                  setEmail('')
                  setEmailStatus('idle')
                } catch (error) {
                  setEmailError(describeError(error))
                  setEmailStatus('failed')
                }
              }}
            >
              <label htmlFor="setup-email">Email me when it is ready</label>
              <p id="setup-email-hint" className="waiting-email-hint">
                By clicking Notify me, you agree to one email when this model is ready. Keep the server
                running for the download to finish. Your address is used only for this reminder.
              </p>
              <div className="waiting-email-controls">
                <input
                  id="setup-email"
                  type="email"
                  autoComplete="email"
                  maxLength={320}
                  value={email}
                  readOnly={saving}
                  aria-invalid={emailStatus === 'invalid' || undefined}
                  aria-describedby="setup-email-hint setup-email-status"
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setEmailStatus('idle')
                  }}
                  placeholder="you@example.com"
                />
                <button
                  className="ew-button primary"
                  type="submit"
                  aria-busy={saving || undefined}
                  disabled={!email.trim() || saving}
                >
                  {saving ? 'Saving…' : 'Notify me'}
                </button>
              </div>
              <span
                id="setup-email-status"
                className={`waiting-email-status ${emailStatus}`}
                role={emailStatus === 'invalid' || emailStatus === 'failed' ? 'alert' : 'status'}
              >
                {emailStatus === 'invalid'
                  ? 'Enter a valid email address.'
                  : emailStatus === 'failed'
                    ? emailError
                    : saving
                      ? 'Saving your reminder…'
                      : reminded
                        ? 'Reminder set. We’ll email you when the model is ready.'
                        : ''}
              </span>
            </form>
          )}
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
