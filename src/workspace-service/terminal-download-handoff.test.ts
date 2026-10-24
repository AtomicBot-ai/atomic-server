import { afterEach, expect, it, vi } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { TerminalSetup } from '../terminal-setup/index.js'
import type { ModelSetup, ModelSetupPlan, SetupWorkspace } from '../terminal-setup/index.js'
import { downloadRows } from '../workspace-view/index.js'
import { EngineDownloads } from './engine-downloads.js'

const cleanups: Array<() => void> = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

it('admits the terminal model immediately and shares the still-downloading intro engine', async () => {
  const tmp = tmpDataFolder(),
    link = fakeCoreLink()
  cleanups.push(tmp.cleanup)
  let finish!: () => void
  const install = new Promise<void>((resolve) => {
    finish = resolve
  })
  const builds: Array<{ version: string; backend: string }> = []
  link.responses['GET /backends/llamacpp-upstream'] = { backends: builds }
  link.responses['POST /engines/versions'] = { engines: [] }
  link.responses['POST /engines/llamacpp-upstream/update'] = async () => {
    await install
    builds.push({ version: 'b1', backend: 'cpu' })
  }
  const engines = new EngineDownloads(tmp.paths.atcDir, link)
  await engines.enqueue('llamacpp-upstream', { target: { version: 'b1', variant: 'cpu' }, select: true })
  const plan = {
    model_id: 'Qwen 4B',
    provider: 'llamacpp-upstream',
    total_download_bytes: 1000,
    digest: 'plan',
    model: { repo: 'owner/Qwen', file: 'qwen.gguf', size: 1000 },
    blockers: [],
  } as unknown as ModelSetupPlan
  const jobs: ModelSetup[] = []
  const workspace: SetupWorkspace = {
    execute: async (operation, input = {}) => {
      if (operation === 'engines.enqueue') return engines.enqueue(String(input['engine']), input)
      if (operation === 'setup.status') return { setups: jobs }
      if (operation === 'models.install') {
        jobs.push({
          setup_id: 'model-job',
          request_id: input['request_id'],
          stage: 'downloading_model',
          plan,
          task_ids: { model: 'model-transfer' },
        } as ModelSetup)
        return jobs[0]
      }
      throw new Error(`Unexpected operation: ${operation}`)
    },
    snapshot: async () => ({
      setups: jobs,
      downloads: [
        ...(await engines.list()),
        { taskId: 'model-transfer', total: 1000, transferred: 250, percent: 25 },
      ],
    }),
  }
  const setup = new TerminalSetup(tmp.paths.atcDir, async () => link, workspace)
  const progress = await setup.begin('server', 'llamacpp-upstream|b1|cpu', [
    { plan, requestId: 'selected-model', request: { repo: 'owner/Qwen', file: 'qwen.gguf' } },
  ])
  expect(progress.jobs).toHaveLength(1)
  expect(progress.engineReady).toBe(false)
  expect(link.calls.filter((call) => /\/(update|install)$/.test(call.path))).toHaveLength(1)
  finish()
  await vi.waitFor(async () => expect((await engines.list())[0]?.stage).toBe('ready'))
  const snapshot = await workspace.snapshot()
  expect(downloadRows(snapshot.setups, snapshot.downloads)).toMatchObject([
    { id: 'model-job', model_id: 'Qwen 4B', transferred: 250, total: 1000 },
  ])
  expect((await setup.progress()).engineReady).toBe(true)
  expect(link.calls.some((call) => call.path === '/backends/llamacpp-upstream/install')).toBe(false)
})
