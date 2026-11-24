/** Account commands where the server cannot run them: accounts off, or no admin listener to reach the server. */
import { afterEach, describe, expect, it } from 'vitest'
import { FakeAccountBackend } from '../helpers/fake-account-backend.js'
import { testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'

let t: TestRun
afterEach(() => t?.cleanup())

describe('account commands without a server that runs them', () => {
  it('need the web admin: the account lives in the server process', async () => {
    t = testRun({ io: { fetch: new FakeAccountBackend().fetch } })
    t.io.env['ATC_ACCOUNT_ENABLED'] = 'true'
    expect(await t.run(['account'])).toBe(2)
    expect(t.io.err.join('')).toContain('Enable the web admin to use the Atomic Chat account.')
    expect(await t.run(['remote', 'share', 'maybe'])).toBe(2)
  })
})
