import { mkdir, writeFile } from 'node:fs/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../config/index.js'
import { createWorkspaceClient } from './client.js'

const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))

async function fixture() {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  await mkdir(tmp.paths.runDir, { recursive: true })
  const record = {
    schema_version: 1,
    instance_id: 'fake-instance',
    pid: 4242,
    admin_url: 'http://127.0.0.1:15555',
  }
  const update = (next: typeof record) => writeFile(tmp.paths.daemonRecord, JSON.stringify(next))
  await update(record)
  await writeFile(tmp.paths.adminToken, 'private-token')
  const request = vi.fn<typeof fetch>()
  const client = await createWorkspaceClient({
    link: fakeCoreLink(),
    paths: tmp.paths,
    config: defaultConfig(),
    fetch: request,
  })
  return { record, update, request, client }
}

it.each([
  ['another instance', { instance_id: 'another-instance' }, 'ATC_DAEMON_NOT_RUNNING'],
  ['external host', { admin_url: 'http://example.com' }, 'ATC_USAGE'],
  ['embedded credentials', { admin_url: 'http://user:password@127.0.0.1:15556' }, 'ATC_USAGE'],
  ['non-HTTP protocol', { admin_url: 'https://127.0.0.1:15556' }, 'ATC_USAGE'],
])('does not send a token to %s after a refusal', async (_, change, code) => {
  const { record, update, request, client } = await fixture()
  request.mockRejectedValueOnce(Object.assign(new Error('refused'), { code: 'ConnectionRefused' }))
  await expect(client.execute('models.installed')).rejects.toMatchObject({ code: 'ATC_DAEMON_NOT_RUNNING' })
  await update({ ...record, ...change })
  await expect(client.execute('models.installed')).rejects.toMatchObject({ code })
  expect(request).toHaveBeenCalledTimes(1)
})

it.each(['ECONNRESET', 'ETIMEDOUT', 'UND_ERR_SOCKET'])(
  'preserves an unrelated %s failure and cached target',
  async (code) => {
    const { record, update, request, client } = await fixture()
    const failure = new TypeError('fetch failed', {
      cause: Object.assign(new Error('transport failure'), { code }),
    })
    request.mockRejectedValueOnce(failure).mockResolvedValueOnce(Response.json([]))
    await expect(client.execute('models.installed')).rejects.toBe(failure)
    await update({ ...record, admin_url: 'http://127.0.0.1:15556' })
    await expect(client.execute('models.installed')).resolves.toEqual([])
    expect(request.mock.calls[1]?.[0]).toBe('http://127.0.0.1:15555/api/workspace/execute')
  }
)
