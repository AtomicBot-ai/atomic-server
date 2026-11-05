import { afterEach, expect, it, vi } from 'vitest'
import { tmpDataFolder } from '../../../../test/helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../../../../test/helpers/fake-core-link.js'
import { resolveConfig } from '../../../config/index.js'
import { AtcError } from '../../../errors/index.js'
import * as workspace from '../../../workspace-service/index.js'
import { WorkspaceRuntime } from './runtime.js'

const cleanup: Array<() => void> = []
afterEach(() => {
  vi.restoreAllMocks()
  cleanup.splice(0).forEach((fn) => fn())
})

it.each(['snapshot', 'read', 'execute'] as const)(
  'rebuilds the same-instance workspace after %s reports a stopped server',
  async (method) => {
    const tmp = tmpDataFolder()
    cleanup.push(tmp.cleanup)
    const link = fakeCoreLink()
    const failure = new AtcError('ATC_DAEMON_NOT_RUNNING', 'Server stopped.')
    const first = {
      snapshot: vi.fn().mockRejectedValue(failure),
      execute: vi.fn().mockRejectedValue(failure),
    }
    const recovered = {
      snapshot: vi.fn().mockResolvedValue({ recovered: true }),
      execute: vi.fn().mockResolvedValue({ recovered: true }),
    }
    const create = vi
      .spyOn(workspace, 'createWorkspaceClient')
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(recovered)
    const capture = vi.fn()
    const runtime = new WorkspaceRuntime(
      {
        paths: tmp.paths,
        attach: async () => link,
        loadConfig: async () => resolveConfig({ env: {} }),
        runDoctor: async () => [],
        pendingHostSteps: async () => [],
        loginUrl: async () => '',
        openUrl: async () => undefined,
        now: () => new Date(),
        errors: { capture },
      },
      vi.fn<typeof fetch>()
    )
    const call = () => (method === 'snapshot' ? runtime.snapshot() : runtime[method]('models.installed'))
    await expect(call()).rejects.toBe(failure)
    await expect(call()).resolves.toEqual({ recovered: true })
    expect(create).toHaveBeenCalledTimes(2)
    expect(capture).not.toHaveBeenCalled()
    runtime.dispose()
  }
)
