import { mkdir, writeFile } from 'node:fs/promises'
import { afterEach, expect, it, vi } from 'vitest'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../config/index.js'
import { writeDaemonRecord } from '../core-link/index.js'
import type { DaemonRecord } from '../core-link/index.js'
import { createWorkspaceClient } from './client.js'
const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))
it('sends operations to the matching daemon without disclosing its token in URLs', async () => {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  await mkdir(tmp.paths.runDir, { recursive: true })
  await writeFile(
    tmp.paths.daemonRecord,
    JSON.stringify({
      schema_version: 1,
      instance_id: 'fake-instance',
      pid: 4242,
      admin_url: 'http://127.0.0.1:15555',
    })
  )
  await writeFile(tmp.paths.adminToken, 'admin-private-token')
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: 'job' })))
  const client = await createWorkspaceClient({
    link: fakeCoreLink(),
    paths: tmp.paths,
    config: defaultConfig(),
    fetch: request,
  })
  expect(await client.execute('artifacts.install', { plan_digest: 'one', request_id: 'job' })).toEqual({
    id: 'job',
  })
  expect(request.mock.calls[0]?.[0]).toBe('http://127.0.0.1:15555/api/workspace/execute')
  expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({
    'Authorization': 'Bearer admin-private-token',
    'x-atc-admin': '1',
  })
})
it.each([
  ['engines.enqueue', { engine: 'llamacpp-upstream' }],
  ['engines.retry', { id: 'job' }],
  ['artifacts.install', { plan_digest: 'one', request_id: 'job' }],
  ['artifacts.resume', { id: 'job' }],
  ['models.install', { request: { repo: 'o/r', file: 'm.gguf' }, plan_digest: 'one', request_id: 'job' }],
  ['setup.resume', { setup_id: 'job' }],
])('does not start %s in a process that may exit when the admin is disabled', async (operation, input) => {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const link = fakeCoreLink()
  const client = await createWorkspaceClient({ link, paths: tmp.paths, config: defaultConfig() })
  await expect(client.execute(operation, input)).rejects.toThrow('Enable the web admin')
  expect(link.calls).toEqual([])
})
// A client created while the server is still starting (its record says `starting`, no admin yet)
// waits for it; falling back to a service in this process would stay that way for the server's life.
it('waits for a starting server and then sends operations to its admin', async () => {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  await mkdir(tmp.paths.runDir, { recursive: true })
  const record = { schema_version: 1, instance_id: 'fake-instance', pid: 4242 }
  await writeFile(tmp.paths.daemonRecord, JSON.stringify({ ...record, state: 'starting', admin_url: null }))
  await writeFile(tmp.paths.adminToken, 'admin-private-token')
  setTimeout(() => {
    void writeDaemonRecord(tmp.paths.daemonRecord, {
      ...record,
      state: 'ready',
      admin_url: 'http://127.0.0.1:15555',
    } as DaemonRecord)
  }, 200)
  const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: 'job' })))
  const client = await createWorkspaceClient({
    link: fakeCoreLink(),
    paths: tmp.paths,
    config: defaultConfig(),
    fetch: request,
  })
  await client.execute('models.install', { request: {}, plan_digest: 'one', request_id: 'job' })
  expect(request.mock.calls[0]?.[0]).toBe('http://127.0.0.1:15555/api/workspace/execute')
})
