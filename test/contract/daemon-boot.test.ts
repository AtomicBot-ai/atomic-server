/**
 * `api.autoStart` and `models.autoLoad` are the server's own work once it is ready (nothing read them
 * before 0.2.2): the API comes up on the configured listener, the named models load, and a model that
 * cannot load is a warning in the log, not a server that failed to start.
 */
import { AtomicCore } from '@atomic-chat/core'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../../src/config/index.js'
import { startDaemon } from '../../src/daemon/index.js'
import type { RunningDaemon } from '../../src/daemon/index.js'
import { recordingIo } from '../../src/io.js'
import { createLogger } from '../../src/output/index.js'
import type { LogEntry } from '../../src/output/index.js'
import { fakeHost } from '../helpers/test-context.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

const started: Array<{ daemon: RunningDaemon; cleanup: () => void }> = []

async function boot(env: Record<string, string>) {
  const { paths, cleanup } = tmpDataFolder('atc-boot-')
  const lines: LogEntry[] = []
  const daemon = await startDaemon({
    paths,
    io: recordingIo(),
    config: resolveConfig({ env: { ATC_API_PORT: '0', ...env } }),
    host: fakeHost(),
    log: createLogger((e) => lines.push(e), { level: 'debug' }),
    controlPort: 0,
    admin: { enabled: false },
    telemetry: false,
    createCore: (options) => AtomicCore.create(options),
  })
  started.push({ daemon, cleanup })
  await daemon.boot
  return { daemon, lines }
}

afterEach(async () => {
  for (const { daemon, cleanup } of started.splice(0)) {
    await daemon.shutdown().catch(() => undefined)
    cleanup()
  }
})

describe('the server once it is ready', () => {
  it('starts the API by default (api.autoStart)', async () => {
    const { daemon, lines } = await boot({})
    expect((await daemon.link.server.status()).running).toBe(true)
    expect(lines.some((l) => l.message.includes('api.autoStart'))).toBe(true)
  }, 60_000)

  it('leaves the API stopped with api.autoStart=false', async () => {
    const { daemon } = await boot({ ATC_API_AUTO_START: 'false' })
    expect((await daemon.link.server.status()).running).toBe(false)
  }, 60_000)

  it('warns about a models.autoLoad entry it cannot load and stays up', async () => {
    const { daemon, lines } = await boot({ ATC_MODELS_AUTO_LOAD: 'no-such-model' })
    expect(daemon.record.state).toBe('ready')
    const warn = lines.find((l) => l.level === 'warn' && l.message.includes('no-such-model'))
    expect(warn?.message).toContain('models.autoLoad')
  }, 60_000)
})
