/**
 * The core is the only source of hardware facts (core ADR 2026-09-27): it probes the machine itself,
 * and an override replaces that probe wholesale. A daemon that pushed its own, poorer probe would
 * hide AMD/Intel GPUs on Linux and real CPU flags on Windows from the engine choice.
 */
import { AtomicCore } from '@atomic-chat/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolveConfig } from '../../src/config/index.js'
import { startDaemon } from '../../src/daemon/index.js'
import type { RunningDaemon } from '../../src/daemon/index.js'
import { recordingIo } from '../../src/io.js'
import { createLogger } from '../../src/output/index.js'
import { fakeHost } from '../helpers/test-context.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

const { paths, cleanup } = tmpDataFolder('atc-hardware-')
let daemon: RunningDaemon

beforeAll(async () => {
  daemon = await startDaemon({
    paths,
    io: recordingIo(),
    config: resolveConfig({ env: {} }),
    host: fakeHost(),
    log: createLogger(() => {}, { level: 'silent' }),
    controlPort: 0,
    admin: { enabled: false },
    telemetry: false,
    createCore: (options) => AtomicCore.create(options),
  })
}, 60_000)

afterAll(async () => {
  await daemon.shutdown().catch(() => undefined)
  cleanup()
})

describe('hardware facts', () => {
  it('come from the core probe: the daemon injects no override', async () => {
    const { override } = await daemon.link.request<{ override: unknown }>('GET', '/hardware/override')
    expect(override).toBeNull()
    const info = await daemon.link.request<{ source: string }>('GET', '/hardware/info')
    expect(info.source).toBe('probe')
  })
})
