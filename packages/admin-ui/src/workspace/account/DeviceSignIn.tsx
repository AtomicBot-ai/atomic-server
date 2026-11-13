import { countdown } from '@view'
import type { AccountSignInStep } from '@contract'
import { Action, Copy } from '../Controls'
import { openSignInPage } from './account-pages'

type DeviceStep = Extract<AccountSignInStep, { state: 'device' }>

/**
 * A device sign-in in progress: the code to confirm, the page that approves it (where Google sign-in also
 * works), and how long the code lasts. The server polls the account service; the page follows the snapshot.
 */
export function DeviceSignIn({
  step,
  now,
  cancel,
}: {
  step: DeviceStep
  now: number
  cancel: () => Promise<unknown>
}) {
  return (
    <div className="remote-access-body account-device">
      <p>Approve this server on the sign-in page, and check that the page shows this code:</p>
      <code className="account-code" aria-label="Sign-in code">
        {step.user_code}
      </code>
      <p>
        On a phone or another computer, go to{' '}
        <a href={step.verification_uri} target="_blank" rel="noreferrer">
          {step.verification_uri}
        </a>{' '}
        and enter the code. You can sign in with Google there.
      </p>
      <p role="status">Waiting for you to approve this server…</p>
      <p className="account-timer" role="timer">
        The code expires in {countdown(step.expires_at, now)}
      </p>
      <div className="remote-access-actions">
        <Action primary onClick={() => openSignInPage(step.verification_uri_complete)}>
          Open the sign-in page
        </Action>
        <Copy value={step.verification_uri_complete} label="Copy link" />
        <Action onClick={cancel}>Cancel</Action>
      </div>
    </div>
  )
}
