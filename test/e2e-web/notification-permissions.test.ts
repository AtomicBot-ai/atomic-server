import { afterAll, beforeAll, expect, it } from 'vitest'
import { adminSession } from '../helpers/admin-browser.js'
import type { AdminSession } from '../helpers/admin-browser.js'
import { seedInterruptedSetup } from '../helpers/interrupted-setup.js'
import { reportCollector } from '../helpers/report-collector.js'

let collector: Awaited<ReturnType<typeof reportCollector>>
let session: AdminSession
beforeAll(async () => {
  collector = await reportCollector()
  session = await adminSession(seedInterruptedSetup, {
    ATC_SENTRY_DSN: collector.dsn,
    ATC_SENTRY_ENVIRONMENT: 'e2e',
  })
})
afterAll(async () => {
  await session?.close()
  await collector?.close()
})

it('keeps notification refusals local while forwarding unexpected request failures', async () => {
  const page = session.page
  await page.getByRole('heading', { name: 'Permissions', exact: true }).waitFor()
  await page.evaluate(() => {
    const target = globalThis as unknown as {
      fetch: (...args: unknown[]) => Promise<unknown>
      clientErrorReports: number
    }
    const fetch = target.fetch.bind(globalThis)
    target.clientErrorReports = 0
    // Count at the synchronous reporting boundary, so absence checks need no timeout or sleep.
    target.fetch = (...args) => {
      if (String(args[0]).endsWith('/api/client-errors')) target.clientErrorReports++
      return fetch(...args)
    }
  })
  await page.getByRole('button', { name: 'Allow', exact: true }).click()
  const reports = () =>
    page.evaluate(() => (globalThis as unknown as { clientErrorReports: number }).clientErrorReports)
  for (const permission of ['unavailable', 'denied', 'default', 'error', 'granted']) {
    await page.evaluate((permission) => {
      Object.defineProperty(globalThis, 'Notification', {
        configurable: true,
        value:
          permission === 'unavailable'
            ? undefined
            : {
                permission: 'default',
                requestPermission: async () => {
                  if (permission === 'error') throw new TypeError('Notification permission request failed')
                  return permission
                },
              },
      })
    }, permission)
    const response =
      permission === 'error'
        ? page.waitForResponse((res) => res.url().endsWith('/api/client-errors'))
        : undefined
    await page.getByRole('button', { name: 'Allow access', exact: true }).click()
    if (permission === 'granted') {
      await page.getByRole('dialog', { name: 'Allow notifications?' }).waitFor({ state: 'detached' })
      await page.getByRole('button', { name: 'Allowed', exact: true }).waitFor()
      expect(await reports()).toBe(1)
    } else {
      const message =
        permission === 'unavailable'
          ? 'Notifications are unavailable in this browser.'
          : permission === 'error'
            ? 'Notification permission request failed'
            : 'Notifications were not allowed. Change the site permission in your browser to retry.'
      await page.getByRole('alert').filter({ hasText: message }).waitFor()
      expect(await page.getByRole('button', { name: 'Allow access', exact: true }).isEnabled()).toBe(true)
      expect(await reports()).toBe(permission === 'error' ? 1 : 0)
    }
    if (response) {
      expect((await response).status()).toBe(202)
      await expect.poll(() => collector.events.length).toBe(1)
      expect(collector.events[0]).toContain('"operation":"browser.action"')
      expect(collector.events[0]).toContain('TypeError')
    }
  }
})
