import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { defaultConfig } from '../../src/config/index.js'
import { WorkspaceService } from '../../src/workspace-service/index.js'
import { fakeCoreLink } from '../helpers/fake-core-link.js'
import { FixtureHttpServer } from '../helpers/fixture-http-server.js'
import { HF_SHA, qwenFiles, serveRepository } from '../helpers/hf-hub.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

const server = new FixtureHttpServer()
const REPO = 'private-owner/private-checkpoint'
const cleanup: Array<() => void> = []
let hub: string
beforeAll(async () => {
  hub = await server.start()
})
afterAll(() => server.stop())
beforeEach(() => server.reset())
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()))

function context(request: typeof fetch = fetch) {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const link = fakeCoreLink()
  link.responses['POST /engines/versions'] = { engines: [{ engine: 'vllm' }] }
  const capture = vi.fn()
  const service = new WorkspaceService({
    link,
    paths: tmp.paths,
    config: defaultConfig(),
    fetch: request,
    env: { HF_ENDPOINT: hub },
    errors: { capture },
  })
  return { service, capture, link }
}

it.each(['missing-repository', 'missing-revision', 'missing-config', 'config-404', 'gated'])(
  'keeps %s as a user refusal without reporting or asking an engine for a verdict',
  async (scenario) => {
    const files = qwenFiles()
    if (scenario === 'missing-config') delete files['config.json']
    if (scenario !== 'missing-repository')
      serveRepository(server, REPO, files, scenario === 'gated' ? { gated: 403 } : {})
    if (scenario === 'config-404') server.files.delete(`/${REPO}/resolve/${HF_SHA}/config.json`)
    const { service, capture, link } = context()
    await expect(
      service.execute('models.check', {
        repository: REPO,
        ...(scenario === 'missing-revision' ? { revision: 'absent' } : {}),
      })
    ).rejects.toMatchObject({ code: 'ATC_USAGE' })
    expect(capture).not.toHaveBeenCalled()
    expect(link.calls.some((call) => call.path.endsWith('/check'))).toBe(false)
  }
)

it.each([429, 500, 503])('keeps HTTP %i reportable with a safe status code', async (status) => {
  serveRepository(server, REPO, qwenFiles())
  server.files.set(`/${REPO}/resolve/${HF_SHA}/config.json`, {
    body: Buffer.from('private-response-body'),
    failStatus: status,
    failTimes: 1,
  })
  const { service, capture } = context()
  await expect(service.execute('models.check', { repository: REPO })).rejects.toMatchObject({
    code: `HF_HTTP_${status}`,
  })
  expect(capture).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      tags: expect.objectContaining({
        component: 'workspace',
        operation: 'models.check',
        error_code: `HF_HTTP_${status}`,
      }),
    })
  )
  const report = capture.mock.calls[0]![0] as { error: Error; tags: Record<string, string> }
  const sent = JSON.stringify({
    ...report,
    error: { message: report.error.message, stack: report.error.stack },
  })
  expect(sent).not.toContain(REPO)
  expect(sent).not.toContain(hub)
  expect(sent).not.toContain('private-response-body')
})

it('preserves and reports an unexpected network exception', async () => {
  const error = new TypeError('fetch failed')
  const { service, capture } = context(async () => {
    throw error
  })
  await expect(service.execute('models.check', { repository: REPO })).rejects.toBe(error)
  expect(capture).toHaveBeenCalledOnce()
})
