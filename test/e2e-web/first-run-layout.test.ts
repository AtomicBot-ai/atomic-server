/**
 * The web admin's waiting screen in a narrow window (0.2.7 retest N01): the download card above it must not
 * cover the heading, and the heading stays in view while the content under it scrolls (the email field and
 * the game do not fit at 688×955). Measured in Chromium on the built program, where the stylesheets cascade.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { adminSession } from '../helpers/admin-browser.js'
import type { AdminSession } from '../helpers/admin-browser.js'
import { seedInterruptedSetup } from '../helpers/interrupted-setup.js'

let s: AdminSession
beforeAll(async () => {
  s = await adminSession(seedInterruptedSetup)
})
afterAll(() => s?.close())

it.each([
  [688, 955],
  [476, 955],
  [1280, 900],
])('keeps the waiting heading below the download card and in view at %i×%i', async (width, height) => {
  const page = s.page
  await page.setViewportSize({ width, height })
  await page.reload()
  await page.getByRole('heading', { name: 'Permissions' }).waitFor()
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await page.getByRole('button', { name: 'Continue without permissions' }).click()
  await page.getByRole('heading', { name: 'Remote providers' }).waitFor()
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await page.getByRole('heading', { name: 'Image and video models' }).waitFor()
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await page.getByRole('button', { name: /Configure an endpoint/ }).click()
  await page.getByLabel('Email me when it is ready').waitFor()
  const content = page.locator('.first-run .first-run-content')
  const card = await page.locator('.first-run .floating-downloads').boundingBox()
  expect(card).not.toBeNull()
  expect((await page.getByRole('heading', { level: 1 }).boundingBox())!.y).toBeGreaterThanOrEqual(
    card!.y + card!.height
  )
  // Playing the game scrolls the content to it.
  await content.evaluate((e) => {
    const content = e as unknown as { scrollTo: (x: number, y: number) => void; scrollHeight: number }
    content.scrollTo(0, content.scrollHeight)
  })
  const area = (await content.boundingBox())!,
    heading = (await page.getByRole('heading', { level: 1 }).boundingBox())!
  expect(heading.y).toBeGreaterThanOrEqual(area.y)
  expect(heading.y + heading.height).toBeLessThanOrEqual(area.y + area.height)
})
