import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { defaultConfig } from '../config/index.js'
import { WorkspaceService } from './service.js'
const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))
const input = {
  provider: 'fixture',
  base_url: 'https://provider.example/v1',
  api_key: 'secret-fixture',
  models: ['one'],
}
function fixture(response: Response | Error) {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const link = fakeCoreLink()
  let providers: object[] = []
  link.responses['GET /cloud/providers'] = () => ({ providers })
  link.responses['PUT /cloud/providers/fixture'] = (body: Record<string, unknown>) => {
    const saved = {
      provider: 'fixture',
      base_url: body['base_url'],
      models: body['models'],
      has_api_key: true,
    }
    providers = [saved]
    return saved
  }
  const request = vi.fn(async () => {
    if (response instanceof Error) throw response
    return response
  })
  const service = new WorkspaceService({
    link,
    paths: tmp.paths,
    config: defaultConfig(),
    fetch: request as typeof fetch,
  })
  return { tmp, link, request, service }
}
it('checks credentials and model IDs before saving, persists only non-secret check evidence', async () => {
  const { tmp, link, request, service } = fixture(Response.json({ data: [{ id: 'one' }] }))
  const result = await service.execute('cloud.connect', input)
  expect(request).toHaveBeenCalledWith(
    'https://provider.example/v1/models',
    expect.objectContaining({
      redirect: 'error',
      headers: { Accept: 'application/json', Authorization: 'Bearer secret-fixture' },
    })
  )
  expect(link.calls.at(-1)?.method).toBe('PUT')
  expect(result).toMatchObject({ connected: true, provider: 'fixture' })
  expect(await service.execute('cloud.list')).toMatchObject({ providers: [{ connected: true }] })
  const path = join(
    tmp.paths.atcDir,
    'cloud-checks',
    `${createHash('sha256').update('fixture').digest('hex')}.json`
  )
  expect(await readFile(path, 'utf8')).not.toContain('secret-fixture')
  await service.execute('cloud.save', { ...input, models: ['two'] })
  expect(await service.execute('cloud.list')).toMatchObject({ providers: [{ connected: false }] })
})
it.each([
  [new Response('secret-fixture', { status: 401 }), 'rejected this API key'],
  [Response.json({ data: [{ id: 'different' }] }), 'Model not available'],
  [Response.json({ ok: true }), 'OpenAI-compatible model list'],
  [new Error('secret-fixture'), 'Could not reach the provider'],
])('does not save a failed connection or expose provider response contents', async (response, message) => {
  const { link, service } = fixture(response)
  await expect(service.execute('cloud.connect', input)).rejects.toThrow(message)
  expect(link.calls.some((call) => call.method === 'PUT')).toBe(false)
})
it('requires the saved key to be re-entered and never reads it back from core', async () => {
  const { link, request, service } = fixture(Response.json({ data: [] }))
  link.responses['GET /cloud/providers'] = { providers: [{ provider: 'fixture', has_api_key: true }] }
  await expect(service.execute('cloud.connect', { ...input, api_key: '' })).rejects.toThrow(
    'Enter the API key again'
  )
  expect(request).not.toHaveBeenCalled()
  expect(link.calls).toHaveLength(1)
})
it('refuses URL credentials before sending a request', async () => {
  const { request, service } = fixture(Response.json({ data: [] }))
  await expect(
    service.execute('cloud.connect', { ...input, base_url: 'https://user:secret@example.test/v1' })
  ).rejects.toThrow('without credentials')
  expect(request).not.toHaveBeenCalled()
})
it('discovers model IDs from the checked provider when none were entered', async () => {
  const { service, link } = fixture(
    Response.json({ data: [{ id: 'one' }, { id: 'two' }, { id: 'one' }, {}, { id: 12 }] })
  )
  expect(await service.execute('cloud.connect', { ...input, models: [] })).toMatchObject({
    models: ['one', 'two'],
    connected: true,
  })
  expect(link.calls.at(-1)?.body).toMatchObject({ models: ['one', 'two'] })
})
it('does not connect a provider with an empty model list', async () => {
  const { service, link } = fixture(Response.json({ data: [] }))
  await expect(service.execute('cloud.connect', { ...input, models: [] })).rejects.toThrow(
    'no available models'
  )
  expect(link.calls.some((call) => call.method === 'PUT')).toBe(false)
})
