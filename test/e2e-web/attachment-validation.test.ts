import { afterAll, beforeAll, expect, it } from 'vitest'
import { adminSession } from '../helpers/admin-browser.js'
import type { AdminSession } from '../helpers/admin-browser.js'
import { reportCollector } from '../helpers/report-collector.js'

let collector: Awaited<ReturnType<typeof reportCollector>>
let session: AdminSession
beforeAll(async () => {
  collector = await reportCollector()
  session = await adminSession(() => {}, { ATC_SENTRY_DSN: collector.dsn, ATC_SENTRY_ENVIRONMENT: 'e2e' })
  expect(session.atc('control', 'call', 'setup.manual', '--json').code).toBe(0)
  await session.page.reload()
})
afterAll(async () => {
  await session?.close()
  await collector?.close()
})

it('keeps attachment refusals local and still accepts a valid document afterwards', async () => {
  const page = session.page
  await page.getByRole('button', { name: 'Playground', exact: true }).click()
  await page.getByLabel('Choose attachments', { exact: true }).waitFor({ state: 'attached' })
  await page.evaluate(() => {
    const target = globalThis as unknown as {
      fetch: (...args: unknown[]) => Promise<unknown>
      clientErrorReports: number
    }
    const fetch = target.fetch.bind(globalThis)
    target.clientErrorReports = 0
    // Count at the reporting boundary, so absence checks need no arbitrary wait.
    target.fetch = (...args) => {
      if (String(args[0]).endsWith('/api/client-errors')) target.clientErrorReports++
      return fetch(...args)
    }
  })
  const input = page.getByLabel('Choose attachments', { exact: true })
  await input.setInputFiles({ name: 'image.png', mimeType: 'image/png', buffer: Buffer.from('image') })
  await page.getByRole('alert').filter({ hasText: 'This model cannot read images.' }).waitFor()
  await input.setInputFiles(
    Array.from({ length: 6 }, (_, i) => ({
      name: `notes-${i}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from('notes'),
    }))
  )
  await page.getByRole('alert').filter({ hasText: 'Attach at most five files per message.' }).waitFor()
  await input.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('notes') })
  await page.getByRole('button', { name: 'Remove notes.txt', exact: true }).waitFor()
  expect(await page.getByRole('alert').count()).toBe(0)
  expect(
    await page.evaluate(() => (globalThis as unknown as { clientErrorReports: number }).clientErrorReports)
  ).toBe(0)
  expect(collector.events).toHaveLength(0)
})
