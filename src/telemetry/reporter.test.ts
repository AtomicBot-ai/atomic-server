import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { TelemetryControl } from '@atomic-chat/core/host'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAtcReporter } from './reporter.js'

const DSN = 'https://abc@o1.ingest.sentry.io/42'

describe('the atc error reporter', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  })
  const setup = async (input: { env?: NodeJS.ProcessEnv; consent?: boolean } = {}) => {
    const dir = mkdtempSync(join(tmpdir(), 'atc-reporter-'))
    dirs.push(dir)
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('{}'))
    const reporter = await createAtcReporter({
      env: { ATC_SENTRY_DSN: DSN, ...input.env },
      consent: input.consent,
      dataFolder: dir,
      telemetryFile: join(dir, 'telemetry.json'),
      homeDir: tmpdir(),
      platform: 'linux',
      arch: 'x64',
      fetch,
      warn: () => {},
    })
    const send = async () => {
      reporter.capture({ source: 'startup', level: 'fatal', error: new Error(`boom ${Math.random()}`) })
      await reporter.flush(1_000)
    }
    return { reporter, fetch, send }
  }
  const control = (enabled: boolean): TelemetryControl => ({
    capture: () => {},
    update: () => {},
    state: () => ({ enabled, reporting: enabled, has_user: false, tags: {}, source: 'host', host: 'atc' }),
  })

  it("sends to atc's own project, as atc", async () => {
    const { fetch, send } = await setup()
    await send()
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(String(url)).toContain('/api/42/envelope/')
    expect(String(init?.body)).toContain('"release":"atc@')
    expect(String(init?.body)).toContain('"host":"atc"')
  })

  it.each([
    ['the person said no', { consent: false }],
    ['DO_NOT_TRACK is set', { consent: true, env: { DO_NOT_TRACK: '1' } }],
    ['the build reports nowhere', { env: { ATC_SENTRY_DSN: '' } }],
  ])('sends nothing when %s', async (_name, input) => {
    const { fetch, send } = await setup(input)
    await send()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps one anonymous install id even while reports are off, for when they are turned on', async () => {
    const { reporter } = await setup({ consent: false })
    reporter.follow(control(true))
    const dir = dirs.at(-1) as string
    expect(JSON.parse(readFileSync(join(dir, 'telemetry.json'), 'utf8'))).toHaveProperty('install_id')
  })

  it("follows the core's consent once there is a core, as `config set` changes it", async () => {
    const { reporter, fetch, send } = await setup({ consent: true })
    reporter.follow(control(false))
    await send()
    expect(fetch).not.toHaveBeenCalled()
    reporter.follow(control(true))
    await send()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
