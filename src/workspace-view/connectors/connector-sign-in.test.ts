import { expect, it } from 'vitest'
import { OAUTH_POLL_MS, signInStep } from './connector-sign-in.js'

it.each([
  [{ state: 'waiting' }, { next: 'wait' }],
  [{ state: 'complete' }, { next: 'connect' }],
  [
    { state: 'error', error: 'Denied' },
    { next: 'stop', error: 'Denied' },
  ],
  [{ state: 'error' }, { next: 'stop', error: 'Sign-in failed. Try again.' }],
  [{ state: 'cancelled' }, { next: 'stop' }],
  [{ state: 'idle' }, { next: 'stop' }],
])('reads sign-in status %j as %j', (status, step) => {
  expect(signInStep(status)).toEqual(step)
})

it('asks first after the browser has had a moment, then every second', () => {
  expect(OAUTH_POLL_MS).toEqual({ first: 700, every: 1000 })
})
