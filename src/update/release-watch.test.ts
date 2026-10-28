import { afterEach, describe, expect, it, vi } from 'vitest'
import { installCommand, RELEASE_CHECK_INTERVAL_MS, ReleaseWatch } from './release-watch.js'

const release = (tag: string) => async () =>
  new Response(JSON.stringify({ tag_name: tag, html_url: `https://example.test/${tag}`, assets: [] }), {
    status: 200,
  })

afterEach(() => vi.useRealTimers())

describe('the server’s look at releases', () => {
  it('knows nothing before the first look', () => {
    const watch = new ReleaseWatch({ fetch: release('v0.3.0'), current: '0.2.4', command: 'atc update' })
    expect(watch.view()).toEqual({ version: '0.2.4', checked_at: null, update: null })
  })

  it('reports a newer release with what installs it, and none when up to date', async () => {
    const now = () => 1_700_000_000_000
    const watch = new ReleaseWatch({ fetch: release('v0.3.0'), current: '0.2.4', command: 'atc update', now })
    expect(await watch.check()).toEqual({
      version: '0.2.4',
      checked_at: 1_700_000_000_000,
      update: { version: '0.3.0', url: 'https://example.test/v0.3.0', command: 'atc update' },
    })
    const same = new ReleaseWatch({ fetch: release('v0.2.4'), current: '0.2.4', command: 'atc update', now })
    expect((await same.check()).update).toBeNull()
    expect((await same.check()).checked_at).toBe(1_700_000_000_000)
  })

  it('keeps what it knew when a look fails, and says so only in the log', async () => {
    const answers = [release('v0.3.0'), async () => new Response('down', { status: 503 })]
    const log = vi.fn()
    const watch = new ReleaseWatch({
      fetch: () => answers.shift()!(),
      current: '0.2.4',
      command: null,
      log,
    })
    const first = await watch.check()
    expect(first.update?.version).toBe('0.3.0')
    expect(await watch.check()).toEqual(first)
    expect(log).toHaveBeenCalledWith(expect.stringContaining('503'))
  })

  it('looks after the delay, then every interval, until stopped', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn(release('v0.3.0'))
    const watch = new ReleaseWatch({ fetch, current: '0.2.4', command: 'atc update', delayMs: 1_000 })
    watch.start()
    watch.start()
    expect(fetch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(RELEASE_CHECK_INTERVAL_MS)
    expect(fetch).toHaveBeenCalledTimes(2)
    watch.stop()
    await vi.advanceTimersByTimeAsync(RELEASE_CHECK_INTERVAL_MS)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('names what installs a release on this machine', () => {
    expect(installCommand(undefined, 'aarch64-apple-darwin')).toBe('atc update')
    expect(installCommand('deb', 'x86_64-unknown-linux-gnu')).toBe(
      'sudo apt update && sudo apt install --only-upgrade atc'
    )
    expect(installCommand(undefined, undefined)).toBeNull()
  })
})
