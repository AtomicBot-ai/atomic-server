/** Read-only service checks with a unique absent name; no service is installed or removed. */
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { runAtcAsync } from '../helpers/async-binary.js'
import { reportCollector } from '../helpers/report-collector.js'

const folder = mkdtempSync(join(tmpdir(), 'atc-service-refusals-'))
const name = `atc-e2e-${randomUUID()}`
let collector: Awaited<ReturnType<typeof reportCollector>>
beforeAll(async () => {
  collector = await reportCollector()
})
afterAll(async () => {
  await collector?.close()
  rmSync(folder, { recursive: true, force: true })
})

it('reports absence and refuses control without sending expected failures to Sentry', async () => {
  const service = (action: string) =>
    runAtcAsync(['service', action, '--name', name, '--data-folder', folder, '--json'], {
      env: {
        ...process.env,
        ATC_SENTRY_DSN: collector.dsn,
        ATC_SENTRY_ENVIRONMENT: 'e2e',
        DO_NOT_TRACK: '0',
        ATOMIC_CORE_TELEMETRY: '1',
      },
    })
  const status = await service('status')
  expect(status.code, status.err).toBe(0)
  expect(JSON.parse(status.out)).toMatchObject({ name, installed: false, running: false })
  for (const action of ['start', 'stop', 'restart', 'uninstall']) {
    const refusal = await service(action)
    expect(refusal.code, refusal.err).toBe(1)
    expect(refusal.out).toBe('')
    expect(JSON.parse(refusal.err)).toMatchObject({
      error: {
        code: 'ATC_SERVICE_NOT_INSTALLED',
        message: `The service "${name}" is not installed.`,
        hint: expect.stringContaining(`--name ${name}`),
      },
    })
  }
  expect(collector.events).toEqual([])
})
