import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { workspaceLogs } from './workspace-logs.js'

const dirs: string[] = []
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })))
function log(text: string) {
  const dir = mkdtempSync(join(tmpdir(), 'atc-logs-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'daemon.log'), text)
  return join(dir, 'daemon.log')
}

it('returns the last lines of the server log', async () => {
  expect(await workspaceLogs(log('one\ntwo\nthree\nfour'), 2)).toEqual({ lines: ['three', 'four'] })
})

it('hides API keys and bearer tokens in every line it returns', async () => {
  const key = `atc_${'a1'.repeat(32)}`
  const { lines } = await workspaceLogs(log(`created ${key}\nAuthorization: Bearer secret-token now`), 10)
  expect(lines).toEqual(['created [API key]', 'Authorization: Bearer [redacted] now'])
})

it('reads a server that has not written a log yet as empty', async () => {
  expect(await workspaceLogs(join(tmpdir(), 'atc-no-such-folder', 'daemon.log'), 5)).toEqual({ lines: [''] })
})

it('reports a log it cannot read for another reason', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'atc-logs-'))
  dirs.push(dir)
  await expect(workspaceLogs(dir, 5)).rejects.toMatchObject({ code: 'EISDIR' })
})

it('returns one model’s engine output from the engines log, newest last, without the log prefix', async () => {
  const { engineLogTail } = await import('./workspace-logs.js')
  const path = log(
    [
      '2026-10-27T14:00:00.000Z [info] llamacpp-upstream/qwen3-8b: [stderr] one',
      '2026-10-27T14:00:01.000Z [info] mlx/m: [stdout] other model',
      '2026-10-27T14:00:02.000Z [info] llamacpp-upstream/qwen3-8b: [stderr] two',
      '2026-10-27T14:00:03.000Z [info] llamacpp-upstream/qwen3-8b: [stdout] three',
    ].join('\n')
  )
  expect(await engineLogTail(path, 'llamacpp-upstream', 'qwen3-8b', 2)).toBe('[stderr] two\n[stdout] three')
  expect(await engineLogTail(path, 'llamacpp-upstream', 'none', 2)).toBe('')
  expect(await engineLogTail(join(path, '..', 'missing.log'), 'mlx', 'm', 2)).toBe('')
})
