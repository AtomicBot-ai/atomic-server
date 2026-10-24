/** A connector's browser sign-in as both clients follow it: what its status means and how often to ask. */

export const OAUTH_POLL_MS = { first: 700, every: 1000 } as const

export type SignInStep = { next: 'wait' } | { next: 'connect' } | { next: 'stop'; error?: string }

/** `connect` once the server holds the tokens; `stop` on an error (with its text), a cancel or no sign-in. */
export function signInStep(status: { state: string; error?: string }): SignInStep {
  if (status.state === 'complete') return { next: 'connect' }
  if (status.state === 'error') return { next: 'stop', error: status.error || 'Sign-in failed. Try again.' }
  if (status.state === 'cancelled' || status.state === 'idle') return { next: 'stop' }
  return { next: 'wait' }
}
