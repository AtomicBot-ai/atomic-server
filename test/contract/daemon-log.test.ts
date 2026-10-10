/**
 * The server writes its own log: `atc daemon` (what `start` spawns) and `atc start --foreground`
 * against a real core, with `log.*` from the config. Rotation itself is unit-tested on `fileSink`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import { recordingIo } from '../../src/io.js'
import { runCli } from '../../src/main.js'
import { fakeHost } from '../helpers/test-context.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

async function serverRun(argv: string[], config: Record<string, string> = {}) {
  const { paths, cleanup } = tmpDataFolder('atc-log-')
  cleanups.push(cleanup)
  for (const [key, value] of Object.entries(config))
    expect(await runCli(['config', 'set', key, value], recordingIo(), { paths, host: fakeHost() })).toBe(0)
  // recordingIo answers `waitForShutdown` at once: the server starts, then stops as on SIGTERM.
  const io = recordingIo()
  const code = await runCli(argv, io, { paths, host: fakeHost() })
  return { code, io, paths, log: () => readFileSync(paths.daemonLog, 'utf8') }
}

describe("the server's own log", () => {
  it('is written by `atc daemon` as timestamped human lines, not to stderr', async () => {
    const r = await serverRun(['daemon', '--no-admin'])
    expect(r.code, r.io.err.join('')).toBe(0)
    expect(r.log()).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z \[info\] core: /m)
    expect(r.log()).toContain('core stopped')
    expect(r.io.err.join('')).toBe('')
  }, 60_000)

  it('follows log.level from the config', async () => {
    const r = await serverRun(['daemon', '--no-admin'], { 'log.level': 'warn' })
    expect(r.code).toBe(0)
    expect(existsSync(r.paths.daemonLog) ? r.log() : '').not.toContain('[info]')
  }, 60_000)

  it('goes to the file and to stderr with `start --foreground`, for journald and docker logs', async () => {
    const r = await serverRun(['start', '--foreground', '--no-admin'])
    expect(r.code).toBe(0)
    expect(r.log()).toContain('[info] core:')
    expect(r.io.err.join('')).toContain('core:')
  }, 60_000)
})
