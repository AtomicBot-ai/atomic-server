import { afterAll, beforeAll, expect, it } from 'vitest'
import { adminSession } from '../helpers/admin-browser.js'
import type { AdminSession } from '../helpers/admin-browser.js'
import { reportCollector } from '../helpers/report-collector.js'

let collector: Awaited<ReturnType<typeof reportCollector>>
let session: AdminSession
beforeAll(async () => {
  collector = await reportCollector()
  session = await adminSession(() => {}, { ATC_SENTRY_DSN: collector.dsn, ATC_SENTRY_ENVIRONMENT: 'e2e' })
})
afterAll(async () => {
  await session?.close()
  await collector?.close()
})

it('forwards browser defects through the authenticated server and follows live consent', async () => {
  const trigger = async (name: 'TypeError' | 'ReferenceError' | 'RangeError') => {
    const response = session.page.waitForResponse((res) => res.url().endsWith('/api/client-errors'))
    await session.page.evaluate((name) => {
      const target = globalThis as unknown as {
        ErrorEvent: new (type: string, init: { error: Error }) => unknown
        dispatchEvent(event: unknown): void
      }
      const constructors = { TypeError, ReferenceError, RangeError }
      const error = new constructors[name]('private-prompt-value')
      target.dispatchEvent(new target.ErrorEvent('error', { error }))
    }, name)
    expect((await response).status()).toBe(202)
  }
  await trigger('TypeError')
  await expect.poll(() => collector.events.length).toBe(1)
  expect(session.atc('config', 'set', 'telemetry.enabled', 'false').code).toBe(0)
  await trigger('ReferenceError')
  expect(session.atc('config', 'set', 'telemetry.enabled', 'true').code).toBe(0)
  await trigger('RangeError')
  await expect.poll(() => collector.events.length).toBe(2)
  const sent = collector.events.join('\n')
  expect(sent).toContain('"component":"web-admin"')
  expect(sent).not.toContain('ReferenceError')
  expect(sent).not.toContain('private-prompt-value')
})
