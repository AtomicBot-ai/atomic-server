import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { ATC } from '../helpers/binary.js'
import { reportCollector } from '../helpers/report-collector.js'

let collector: Awaited<ReturnType<typeof reportCollector>>
const scratch = mkdtempSync(join(tmpdir(), 'atc-report-e2e-'))
beforeAll(async () => {
  collector = await reportCollector()
})
afterAll(async () => {
  await collector?.close()
  rmSync(scratch, { recursive: true, force: true })
})

function run(name: string, extra: NodeJS.ProcessEnv = {}) {
  return new Promise<number | null>((resolve, reject) => {
    const [exe, ...args] = ATC
    const child = spawn(exe!, [...args, '--data-folder', join(scratch, name), 'update', '--check'], {
      env: {
        ...process.env,
        ATC_SENTRY_DSN: collector.dsn,
        ATC_SENTRY_ENVIRONMENT: 'e2e',
        ATC_GITHUB_API: collector.base,
        ...extra,
      },
      stdio: 'ignore',
    })
    child.on('error', reject)
    child.on('exit', resolve)
  })
}
it('reports a failed command before the built program exits, without free-form release content', async () => {
  expect(await run('enabled')).toBe(1)
  expect(collector.events).toHaveLength(1)
  expect(collector.events[0]).toContain('"component":"cli"')
  expect(collector.events[0]).toContain('ATC_UPDATE_FAILED')
  expect(collector.events[0]).not.toContain('private-prompt-value')
})
it('does not report when the process opted out', async () => {
  const before = collector.events.length
  expect(await run('disabled', { DO_NOT_TRACK: '1' })).toBe(1)
  expect(collector.events).toHaveLength(before)
})
