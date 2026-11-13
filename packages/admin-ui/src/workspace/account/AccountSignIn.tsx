import { useState } from 'react'
import { countdown } from '@view'
import type { AccountSignInStep, WorkspaceAccount } from '@contract'
import type { Workspace } from '../useWorkspace'
import { Action } from '../Controls'
import { SettingsField, SettingsSection } from '../SettingsForm'
import { describeError } from '@/services/admin-api'
import { DeviceSignIn } from './DeviceSignIn'
import { openSignInPage } from './account-pages'
import { useAccountPoll, useNow } from './use-account-poll'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Signing this server in: a 6-digit code sent to an email address, or a code approved on another device.
 * Where the sign-in stands is the server's (`account.sign_in` in the snapshot); this keeps only what was
 * typed, the address the code went to, and the last error.
 */
export function AccountSignIn({
  workspace: w,
  account,
}: {
  workspace: Workspace
  account: WorkspaceAccount
}) {
  const step = account.sign_in
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const now = useNow(step.state === 'email_sent' || step.state === 'device')
  useAccountPoll(w.refresh, step.state === 'device')
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }
  const send = (address: string) => {
    if (!EMAIL.test(address)) {
      setError('Enter a valid email address.')
      return Promise.resolve()
    }
    return run(async () => {
      await w.execute('account.signin.email.start', { email: address })
      setSentTo(address)
      setCode('')
    })
  }
  const restart = async () => {
    setError('')
    setCode('')
    await w.execute('account.signin.cancel')
  }
  return (
    <SettingsSection
      title="Sign in"
      description="Sign this server in to your Atomic Chat account to share its API with your devices. Each device pairs once and gets its own key."
    >
      {step.state === 'failed' && (
        <p className="ew-error account-failed" role="alert">
          {step.message}
        </p>
      )}
      {step.state === 'device' ? (
        <DeviceSignIn step={step} now={now} cancel={() => w.execute('account.signin.cancel')} />
      ) : step.state === 'email_sent' ? (
        <form
          className="account-sign-in"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (!busy && code.length === 6) void run(() => w.execute('account.signin.email.verify', { code }))
          }}
        >
          <SettingsField
            label="Code"
            hint={codeHint(step, sentTo, now)}
            error={error || undefined}
            actions={
              <button
                className="ew-button primary"
                type="submit"
                aria-busy={busy || undefined}
                disabled={busy || code.length !== 6}
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            }
          >
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              readOnly={busy}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                setError('')
              }}
            />
          </SettingsField>
          <div className="account-actions">
            <Action disabled={busy} onClick={restart}>
              Use a different email
            </Action>
            {sentTo && (
              <Action disabled={busy || now < step.resend_at} onClick={() => send(sentTo)}>
                {now < step.resend_at
                  ? `Send a new code in ${countdown(step.resend_at, now)}`
                  : 'Send a new code'}
              </Action>
            )}
          </div>
        </form>
      ) : (
        <form
          className="account-sign-in"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            if (!busy) void send(email.trim())
          }}
        >
          <SettingsField
            label="Email"
            hint="We’ll email you a 6-digit sign-in code."
            error={error || undefined}
            actions={
              <button
                className="ew-button primary"
                type="submit"
                aria-busy={busy || undefined}
                disabled={busy || !email.trim()}
              >
                {busy ? 'Sending…' : 'Email me a code'}
              </button>
            }
          >
            <input
              type="email"
              autoComplete="email"
              maxLength={320}
              placeholder="you@example.com"
              value={email}
              readOnly={busy}
              onChange={(event) => {
                setEmail(event.target.value)
                setError('')
              }}
            />
          </SettingsField>
        </form>
      )}
      {step.state !== 'device' && (
        <div className="settings-item account-device-row">
          <div>
            <strong>Use another device</strong>
            <small>Approve this server from any browser, with Google or an email code.</small>
          </div>
          <Action
            onClick={async () => {
              const next = await w.execute<AccountSignInStep>('account.signin.device.start')
              if (next?.state === 'device') openSignInPage(next.verification_uri_complete)
            }}
          >
            Sign in on another device
          </Action>
        </div>
      )}
    </SettingsSection>
  )
}

function codeHint(step: Extract<AccountSignInStep, { state: 'email_sent' }>, sentTo: string, now: number) {
  if (now > step.expires_at) return 'This code has expired. Send a new one.'
  return sentTo
    ? `Enter the 6-digit code we sent to ${sentTo}.`
    : 'Enter the 6-digit code from the sign-in email.'
}
