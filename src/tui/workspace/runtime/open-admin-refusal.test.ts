import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { tmpDataFolder } from '../../../../test/helpers/tmp-data-folder.js'
import { resolveConfig } from '../../../config/index.js'
import { AtcError } from '../../../errors/index.js'
import { failureReport } from '../../../telemetry/index.js'
import { WorkspaceRuntime } from './runtime.js'

const cleanup: Array<() => void> = []
afterEach(() => {
  vi.restoreAllMocks()
  cleanup.splice(0).forEach((fn) => fn())
})

it('answers a server without web admin as a typed refusal', async () => {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  await mkdir(dirname(tmp.paths.daemonRecord), { recursive: true })
  await writeFile(
    tmp.paths.daemonRecord,
    JSON.stringify({
      schema_version: 1,
      pid: 4242,
      instance_id: 'instance-under-test',
      state: 'ready',
      admin_url: null,
    })
  )
  const openUrl = vi.fn(async () => undefined)
  const runtime = new WorkspaceRuntime(
    {
      paths: tmp.paths,
      attach: async () => {
        throw new Error('the attach must not be used by openAdmin')
      },
      loadConfig: async () => resolveConfig({ env: {} }),
      runDoctor: async () => [],
      pendingHostSteps: async () => [],
      loginUrl: async () => 'http://127.0.0.1:1338/login',
      openUrl,
      now: () => new Date(),
    },
    vi.fn<typeof fetch>()
  )
  const error = await runtime.openAdmin().then(
    () => undefined,
    (failure: unknown) => failure
  )
  expect(error).toBeInstanceOf(AtcError)
  expect((error as AtcError).code).toBe('ATC_ADMIN_BIND_FAILED')
  expect(failureReport(error, { component: 'tui', operation: 'workspace.action' })).toBeNull()
  expect(openUrl).not.toHaveBeenCalled()
})
