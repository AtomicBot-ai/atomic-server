/** Package-managed updates refuse locally; operational release failures still reach the reporter. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PACKAGE_MARKER } from '../../src/update/index.js'
import type * as Version from '../../src/version.js'
import { fakeHost, testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'

vi.mock('../../src/version.js', async (original) => ({
  ...(await original<typeof Version>()),
  ATC_TARGET: 'x86_64-unknown-linux-gnu',
}))

let t: TestRun | undefined
afterEach(() => t?.cleanup())

function command(source?: string) {
  const capture = vi.fn()
  const fetch = vi.fn(async () => {
    throw new Error('Release lookup failed')
  })
  const host = fakeHost()
  t = testRun({
    io: { fetch, readFile: async (path) => (path === PACKAGE_MARKER ? source : undefined) },
    deps: {
      errors: { capture, flush: async () => {}, follow: () => {} },
      host: fakeHost({
        facts: { ...host.facts, platform: 'linux', arch: 'x64' },
        selfCommand: ['/usr/bin/atc'],
      }),
    },
  })
  return { t, capture, fetch }
}

describe('atc update refusals', () => {
  it.each([
    ['deb', 'sudo apt update && sudo apt install --only-upgrade atc'],
    ['rpm', 'sudo dnf upgrade atc'],
    ['aur', 'yay -Syu atc-bin (or your AUR helper)'],
  ])('keeps the %s package hint and exit 1 without reporting an unexpected failure', async (source, hint) => {
    const c = command(source)
    expect(await c.t.run(['update', '--json'])).toBe(1)
    expect(c.t.io.out).toEqual([])
    expect(JSON.parse(c.t.io.err.join(''))).toMatchObject({
      error: { code: 'ATC_UPDATE_UNSUPPORTED', hint },
    })
    expect(c.fetch).not.toHaveBeenCalled()
    expect(c.capture).not.toHaveBeenCalled()
    expect(c.t.link.calls).toEqual([])
  })

  it('still reports an actual release lookup failure', async () => {
    const c = command()
    expect(await c.t.run(['update', '--json'])).toBe(1)
    expect(JSON.parse(c.t.io.err.join(''))).toMatchObject({ error: { code: 'ATC_UPDATE_FAILED' } })
    expect(c.fetch).toHaveBeenCalledTimes(1)
    expect(c.capture).toHaveBeenCalledTimes(1)
    expect(c.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: { component: 'cli', operation: 'update', error_code: 'ATC_UPDATE_FAILED' },
      })
    )
  })
})
