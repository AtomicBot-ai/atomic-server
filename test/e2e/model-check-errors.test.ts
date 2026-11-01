import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { runAtcAsync } from '../helpers/async-binary.js'
import { fakeManagedMachine } from '../helpers/fake-managed-machine.js'
import type { FakeManagedMachine } from '../helpers/fake-managed-machine.js'
import { FixtureHttpServer } from '../helpers/fixture-http-server.js'
import { HF_SHA, qwenFiles, serveRepository } from '../helpers/hf-hub.js'
import { reportCollector } from '../helpers/report-collector.js'

const scratch = mkdtempSync(join(tmpdir(), 'atc-hf-errors-'))
const hf = new FixtureHttpServer()
const REPO = 'private-owner/private-checkpoint'
let machine: FakeManagedMachine
let collector: Awaited<ReturnType<typeof reportCollector>>
let env: NodeJS.ProcessEnv
const run = (...args: string[]) => runAtcAsync([...args, '--data-folder', join(scratch, 'data')], { env })

beforeAll(async () => {
  if (process.platform === 'win32') return
  machine = await fakeManagedMachine()
  collector = await reportCollector()
  env = {
    ...process.env,
    ...machine.env,
    ATOMIC_CORE_MANAGED_ROOT: join(scratch, 'managed'),
    HF_ENDPOINT: await hf.start(),
    ATC_SENTRY_DSN: collector.dsn,
    ATC_SENTRY_ENVIRONMENT: 'e2e',
  }
  const started = await run('start', '--admin-port', '0')
  expect(started.code, started.err).toBe(0)
}, 60_000)
afterAll(async () => {
  if (env) await run('stop', '--force', '--kill')
  await hf.stop()
  await collector?.close()
  await machine?.close()
  if (machine) rmSync(machine.dir, { recursive: true, force: true })
  rmSync(scratch, { recursive: true, force: true })
})

it.skipIf(process.platform === 'win32')(
  'keeps missing Hub resources local and reports an outage with its HTTP status',
  async () => {
    for (const scenario of ['missing-repository', 'missing-config', 'config-404', 'outage']) {
      hf.reset()
      if (scenario !== 'missing-repository')
        serveRepository(
          hf,
          REPO,
          scenario === 'missing-config' ? { 'README.md': Buffer.from('no model configuration') } : qwenFiles()
        )
      if (scenario === 'config-404') hf.files.delete(`/${REPO}/resolve/${HF_SHA}/config.json`)
      if (scenario === 'outage')
        hf.files.set(`/${REPO}/resolve/${HF_SHA}/config.json`, {
          body: Buffer.from('private-upstream-response'),
          failStatus: 503,
          failTimes: 99,
        })
      const result = await run('models', 'check', REPO, '--engine', 'vllm', '--json')
      expect(result.code, result.err).toBe(scenario === 'outage' ? 1 : 2)
      expect(JSON.parse(result.err)).toMatchObject({
        error: { code: scenario === 'outage' ? 'ATC_INTERNAL' : 'ATC_USAGE' },
      })
      if (scenario === 'outage') {
        await expect.poll(() => collector.events.length).toBe(1)
        expect(collector.events[0]).toContain('HF_HTTP_503')
        expect(collector.events[0]).toContain('"operation":"models.check"')
        expect(collector.events[0]).not.toContain(REPO)
        expect(collector.events[0]).not.toContain('private-upstream-response')
      } else expect(collector.events).toHaveLength(0)
    }
  }
)
