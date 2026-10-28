/**
 * After an update the binary is new and the server is old: the core refuses to attach across core
 * versions, so `atc` must reach the old owner itself. These run the real commands with the real
 * `attachCore` against a stand-in old owner (`fakeOldOwner`), and spawn a real in-process daemon
 * when a command replaces it.
 */
import { existsSync } from 'node:fs'
import { CORE_VERSION } from '@atomic-chat/core'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../../src/config/index.js'
import { startDaemon } from '../../src/daemon/index.js'
import type { RunningDaemon } from '../../src/daemon/index.js'
import { recordingIo } from '../../src/io.js'
import type { RecordingIo } from '../../src/io.js'
import { runCli } from '../../src/main.js'
import { createLogger } from '../../src/output/index.js'
import { fakeOldOwner } from '../helpers/fake-old-owner.js'
import { fakeHost } from '../helpers/test-context.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

const cleanups: Array<() => unknown> = []
afterEach(async () => {
  for (const c of cleanups.splice(0).reverse()) await c()
})

async function setup(options: Parameters<typeof fakeOldOwner>[1] = {}) {
  const t = tmpDataFolder('atc-upgrade-')
  cleanups.push(t.cleanup)
  const old = await fakeOldOwner(t.paths, options)
  cleanups.push(old.close)
  let daemon: RunningDaemon | undefined
  cleanups.push(() => daemon?.shutdown().catch(() => undefined))
  const run = async (argv: string[]): Promise<{ code: number; io: RecordingIo; json: () => unknown }> => {
    const io = recordingIo()
    const code = await runCli([...argv, '--json'], io, {
      paths: t.paths,
      host: fakeHost(),
      spawnDaemon: async () => {
        daemon = await startDaemon({
          paths: t.paths,
          io: recordingIo(),
          config: resolveConfig({ env: { ATC_API_AUTO_START: 'false', ATC_UPDATE_CHECK_ON_START: 'false' } }),
          host: fakeHost(),
          log: createLogger(() => {}, { level: 'silent' }),
          controlPort: 0,
          admin: { enabled: false },
          telemetry: false,
        })
        return {} // in this process: no child to watch
      },
    })
    return { code, io, json: () => JSON.parse(io.out.join('')) }
  }
  return { paths: t.paths, old, run, daemon: () => daemon }
}

describe('a server another atc build left running', () => {
  it('shows in `atc status` as outdated, with both versions, and exit 0', async () => {
    const { run, old } = await setup()
    const r = await run(['status'])
    expect(r.code).toBe(0)
    expect(r.json()).toMatchObject({
      running: true,
      outdated: true,
      core_version: '0.0.1',
      atc_version: '0.0.9',
      expected_core_version: CORE_VERSION,
    })
    expect(old.shutdowns).toEqual([])
  })

  it('is stopped by `atc stop` through its own control API', async () => {
    const { run, old, paths } = await setup()
    const r = await run(['stop'])
    expect(r.code).toBe(0)
    expect(r.json()).toEqual({ stopped: true, outdated: true })
    expect(old.shutdowns).toEqual([{}])
    expect(existsSync(paths.layout.core.instanceLock)).toBe(false)
  })

  it('is refused while clients are attached, and stopped with --force', async () => {
    const { run, old } = await setup({ clients: ['atc tui'] })
    const refused = await run(['stop'])
    expect(refused.code).toBe(1)
    expect(refused.io.err.join('')).toContain('ATC_DAEMON_ALREADY_RUNNING')
    expect(old.shutdowns).toEqual([])
    const forced = await run(['stop', '--force'])
    expect(forced.code).toBe(0)
    expect(old.shutdowns).toEqual([{ force: true }])
  })

  it('is replaced by `atc start` with a server of this build', async () => {
    const { run, old } = await setup()
    const r = await run(['start'])
    expect(r.code).toBe(0)
    expect(r.json()).toMatchObject({ started: true, core_version: CORE_VERSION })
    expect(old.shutdowns).toEqual([{}])
  }, 60_000)

  it('is replaced by `atc restart`, which keeps --force for the stop', async () => {
    const { run, old, daemon } = await setup({ clients: ['atc tui'] })
    const r = await run(['restart', '--force'])
    expect(r.code).toBe(0)
    expect(old.shutdowns).toEqual([{ force: true }])
    expect(daemon()?.core.instanceId).toBeDefined()
  }, 60_000)
})
