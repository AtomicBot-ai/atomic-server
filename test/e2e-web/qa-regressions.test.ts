/** Confirm the exploratory QA fixes through the built server's authenticated workspace API. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { adminSession } from '../helpers/admin-browser.js'
import type { AdminSession } from '../helpers/admin-browser.js'
let s: AdminSession
beforeAll(async () => {
  s = await adminSession()
})
afterAll(async () => {
  await s?.close()
})
const execute = (operation: string, input: Record<string, unknown> = {}) =>
  s.page.request.post(new URL('/api/workspace/execute', s.page.url()).href, {
    data: { operation, input },
    headers: { 'x-atc-admin': '1' },
  })

it('rejects an unsafe API prefix without changing the saved configuration', async () => {
  const before = await (await execute('config.get')).json()
  expect((await execute('config.update', { values: { 'api.prefix': '/qa v1' } })).status()).toBe(400)
  const after = await (await execute('config.get')).json()
  expect(after.values.api.prefix).toBe(before.values.api.prefix)
})

it('rejects an invalid engine enum without changing saved settings', async () => {
  const before = await (await execute('settings.get', { provider: 'llamacpp-upstream' })).json()
  const result = await execute('settings.update', {
    provider: 'llamacpp-upstream',
    values: { flash_attn: 'qa-invalid-mode' },
  })
  expect(result.status()).toBe(400)
  expect(await result.text()).toContain('flash_attn')
  expect(await (await execute('settings.get', { provider: 'llamacpp-upstream' })).json()).toEqual(before)
})

it('rejects a duplicate skill create and preserves the original instructions', async () => {
  expect((await execute('skills.save', { value: { name: 'qa-review', body: 'ORIGINAL' } })).status()).toBe(
    200
  )
  expect((await execute('skills.save', { value: { name: 'qa-review', body: 'REPLACEMENT' } })).status()).toBe(
    400
  )
  const exported = await (await execute('skills.export', { id: 'qa-review' })).json()
  expect(exported.content).toContain('ORIGINAL')
})

it('restores 101 conversations and refuses a stale history write without losing the newer messages', async () => {
  const conversations = Array.from({ length: 101 }, (_, i) => ({
    title: `QA ${i}`,
    messages: [{ role: 'user', content: 'HELLO_879' }],
  }))
  const imported = await execute('history.import', { conversations })
  expect(imported.status(), await imported.text()).toBe(200)
  const result = await imported.json()
  expect(result.imported).toBe(101)
  const stale = await (await execute('history.load', { id: result.ids[0] })).json()
  const messages = [...stale.messages, { role: 'assistant', content: 'NEWER ANSWER' }]
  expect(
    (
      await execute('history.save', { chat: { ...stale, messages }, expected_revision: stale.revision })
    ).status()
  ).toBe(200)
  expect((await execute('history.save', { chat: stale, expected_revision: stale.revision })).status()).toBe(
    400
  )
  expect((await (await execute('history.load', { id: stale.id })).json()).messages).toEqual(messages)
  expect(await (await execute('history.list')).json()).toHaveLength(101)
})
