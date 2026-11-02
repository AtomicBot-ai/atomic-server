/**
 * The web admin's first run on the built program, where this change found a bug: with the first model's
 * download interrupted by a server restart, choosing a destination must show the waiting screen (ADR "Gate
 * inference and keep downloads visible"), not open the server as if the model were ready, even right after
 * the page opens; leaving the waiting screen opens the server.
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

it('shows the waiting screen for an interrupted first model, then opens the server from it', async () => {
  const page = s.page
  await page.getByRole('heading', { name: 'Permissions' }).waitFor()
  await page.mouse.click(1, 1)
  expect(await page.getByRole('heading', { name: 'Permissions' }).count()).toBe(1)
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await page.getByRole('button', { name: 'Continue without permissions' }).click()
  await page.getByRole('heading', { name: 'Remote providers' }).waitFor()
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await page.getByRole('heading', { name: 'Image and video models' }).waitFor()
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await page.getByRole('button', { name: /Configure an endpoint/ }).click()
  await page.getByLabel('Email me when it is ready').waitFor()
  expect(await page.getByRole('region', { name: 'Minesweeper' }).count()).toBe(1)
  await page.mouse.click(1, 1)
  expect(await page.getByRole('region', { name: 'Minesweeper' }).count()).toBe(1)
  await page.getByRole('button', { name: 'Back', exact: true }).click()
  await page.getByRole('button', { name: /Connect an agent/ }).focus()
  await page.keyboard.press('Enter')
  await page.getByRole('region', { name: 'Minesweeper' }).waitFor()
  await page.getByRole('gridcell', { name: 'Row 1, column 1, hidden' }).click()
  expect(JSON.parse(s.atc('control', 'watch', '--count', '1').out).snapshot.setup?.complete).not.toBe(true)
  await page.getByRole('button', { name: "I can't wait - take me to the control panel" }).click()
  await page.getByLabel('Email me when it is ready').waitFor({ state: 'detached' })
  // The server's control panel with the chosen model, the download still visible while it goes on.
  await page.getByRole('region', { name: 'Server control panel' }).waitFor()
  await page.getByRole('button', { name: 'Model owner/model.Q4_K_M' }).waitFor()
  await page.getByRole('complementary', { name: 'Download status' }).waitFor()
  expect(await page.getByLabel('Email me when it is ready').count()).toBe(0)
  const waiting = page.getByRole('button', { name: 'Model download paused', exact: true })
  expect(await waiting.getAttribute('aria-disabled')).toBe('true')
  const box = (await waiting.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.getByRole('status').filter({ hasText: 'Resume the model download to continue.' }).waitFor()
  expect(await page.getByRole('button', { name: 'Stop API', exact: true }).count()).toBe(0)
  expect(JSON.parse(s.atc('control', 'watch', '--count', '1').out).snapshot.api.running).toBe(false)
  expect(s.atc('control', 'call', 'api.start', '--json').code).toBe(2)
})
