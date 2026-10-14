import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../config/index.js'
import { ClientKeys } from '../terminal-data/index.js'
import { createLogger } from '../output/index.js'
import { WorkspaceService } from '../workspace-service/index.js'
import { createBffHandler } from './bff.js'
import { RelayHub } from './relay.js'
import { SessionStore } from './auth.js'
const cleanup: Array<() => Promise<void> | void> = []
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn()
})
async function host() {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const link = fakeCoreLink()
  await new ClientKeys(tmp.paths.atcDir).initialize('private-client-key')
  const service = new WorkspaceService({ link, paths: tmp.paths, config: defaultConfig() })
  const bff = createBffHandler({
    link,
    workspace: service,
    relay: new RelayHub(),
    sessions: new SessionStore(),
    adminToken: async () => 'private-admin-token',
    status: async () => ({}) as never,
    config: async () => ({}) as never,
    log: createLogger(() => {}, { level: 'error' }),
    loopbackOnly: true,
  })
  const server = createServer((req, res) => {
    void bff(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  cleanup.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      })
  )
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, link, paths: tmp.paths }
}
const headers = {
  'authorization': 'Bearer private-admin-token',
  'x-atc-admin': '1',
  'content-type': 'application/json',
}
describe('authenticated workspace BFF', () => {
  it('refuses unauthenticated reads and cross-origin mutations, hides keys in state', async () => {
    const { url } = await host()
    expect((await fetch(`${url}/api/workspace`)).status).toBe(401)
    const snapshot = await fetch(`${url}/api/workspace`, { headers })
    expect(snapshot.status).toBe(200)
    expect(await snapshot.text()).not.toContain('private-client-key')
    const denied = await fetch(`${url}/api/workspace/execute`, {
      method: 'POST',
      headers: { ...headers, origin: 'https://foreign.invalid' },
      body: JSON.stringify({ operation: 'keys.create', input: { name: 'bad' } }),
    })
    expect(denied.status).toBe(403)
  })
  it('executes only registered operations and reveals keys only on explicit authenticated calls', async () => {
    const { url, link } = await host()
    const call = (body: unknown) =>
      fetch(`${url}/api/workspace/execute`, { method: 'POST', headers, body: JSON.stringify(body) })
    expect((await call({ operation: '/shutdown' })).status).toBe(400)
    expect((await call({ operation: 'models.load', input: { model_id: 'no-provider' } })).status).toBe(400)
    expect(await (await call({ operation: 'keys.reveal' })).json()).toEqual({ key: 'private-client-key' })
    expect(link.shutdowns).toBe(0)
  })
})

it('serves only Core gallery-owned media, supports byte ranges and refuses escaped files', async () => {
  const { url, link, paths } = await host(),
    root = join(paths.dataFolder, 'gallery'),
    file = join(root, 'aa.png'),
    outside = join(paths.dataFolder, 'private.txt')
  await mkdir(root, { recursive: true })
  await writeFile(file, 'PNG-CONTENT')
  await writeFile(outside, 'private-data')
  let selected = file
  link.request = async <T>(_method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string) =>
    (path === '/diffusion/status'
      ? { outputDir: root, videoOutputDir: root }
      : { item: { path: selected } }) as T
  const image = await fetch(`${url}/api/workspace/artifacts/image/aa`, {
    headers: { ...headers, range: 'bytes=0-2' },
  })
  expect(image.status).toBe(206)
  expect(await image.text()).toBe('PNG')
  expect(image.headers.get('content-range')).toBe('bytes 0-2/11')
  selected = outside
  const rejected = await fetch(`${url}/api/workspace/artifacts/image/aa`, { headers })
  expect(rejected.status).toBe(400)
  expect(await rejected.text()).not.toContain('private-data')
})
