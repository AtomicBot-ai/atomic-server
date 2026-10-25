/**
 * The web admin's API on the built program, through the signed-in browser's own session, where this change
 * found bugs: a document the person chose that atc cannot read is a 400 usage answer (it was a 500 and an
 * error report), and a cloud provider's key can be saved from a page but never read back from one.
 */
import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { adminSession } from '../helpers/admin-browser.js'
import type { AdminSession } from '../helpers/admin-browser.js'

const SECRET = 'sk-e2e-never-read-back'
let s: AdminSession
let provider: Server
let providerUrl = ''
const seen: string[] = []
beforeAll(async () => {
  provider = createServer((req, res) => {
    seen.push(String(req.headers.authorization ?? ''))
    res
      .writeHead(200, { 'content-type': 'application/json' })
      .end(JSON.stringify({ data: [{ id: 'gpt-e2e' }] }))
  })
  await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve))
  const address = provider.address()
  providerUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/v1`
  s = await adminSession()
})
afterAll(async () => {
  await s?.close()
  await new Promise((resolve) => provider?.close(resolve))
})

const execute = (operation: string, input: Record<string, unknown>) =>
  s.page.request.post(new URL('/api/workspace/execute', s.page.url()).href, {
    data: { operation, input },
    headers: { 'x-atc-admin': '1' },
  })

it('answers a document it cannot read with a 400 usage error, not a server failure', async () => {
  expect((await execute('attachments.update', { value: { enabled: true } })).status()).toBe(200)
  const res = await execute('attachments.parse', {
    name: 'notes.doc',
    data: Buffer.from('legacy').toString('base64'),
  })
  expect(res.status()).toBe(400)
  expect(await res.json()).toMatchObject({
    error: { code: 'ATC_USAGE', message: expect.stringContaining('PDF') },
  })
})

it('saves a cloud provider’s key from the page and never shows it to a page again', async () => {
  const saved = await execute('cloud.connect', {
    provider: 'openai',
    base_url: providerUrl,
    api_key: SECRET,
    models: ['gpt-e2e'],
  })
  expect(saved.status(), await saved.text()).toBe(200)
  expect(seen).toContain(`Bearer ${SECRET}`)
  const snapshot = await s.page.request.get(new URL('/api/workspace', s.page.url()).href)
  expect(snapshot.status()).toBe(200)
  expect(await snapshot.text()).not.toContain(SECRET)
  const listed = await execute('cloud.list', {})
  expect(await listed.text()).toContain('openai')
  expect(await listed.text()).not.toContain(SECRET)
  expect(await saved.text()).not.toContain(SECRET)
})
