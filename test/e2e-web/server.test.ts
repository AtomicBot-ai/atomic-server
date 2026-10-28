/**
 * The web admin's Server pages on the built program, where this change found bugs: Remote access drew its
 * panels' description, status and buttons flush against one another.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { adminSession } from '../helpers/admin-browser.js'
import type { AdminSession } from '../helpers/admin-browser.js'

let s: AdminSession
beforeAll(async () => {
  s = await adminSession()
  expect(s.atc('control', 'call', 'setup.manual', '--json').code).toBe(0)
  await s.page.reload()
  await s.page.getByRole('button', { name: 'Server', exact: true }).click()
})
afterAll(() => s?.close())

it('spaces Remote access’s description, status and button apart in both panels', async () => {
  const page = s.page
  await page.getByRole('button', { name: 'Remote access' }).click()
  for (const [title, button] of [
    ['Public remote access', 'Start remote access'],
    ['Local network', 'Start local network'],
  ] as const) {
    const panel = page.locator('section', { has: page.getByRole('heading', { name: title }) })
    const status = panel.getByRole('status')
    await expect.poll(() => status.textContent()).not.toBe('Checking status…')
    type Box = { getBoundingClientRect(): { top: number; bottom: number } }
    const box = (l: typeof status) => l.evaluate((e) => (e as unknown as Box).getBoundingClientRect())
    const [description, state, action] = await Promise.all([
      box(panel.locator('p').first()),
      box(status),
      box(panel.getByRole('button', { name: button })),
    ])
    expect(state.top - description.bottom, `${title}: description → status`).toBeGreaterThanOrEqual(4)
    expect(action.top - state.bottom, `${title}: status → button`).toBeGreaterThanOrEqual(12)
  }
})

// The API serves without a model: Start starts it (0.2.1 sent the click to the catalog instead).
it('starts the API from the Start button with no model loaded', async () => {
  // Its own server: the API port is read when the server starts, and the machine running this may have
  // its own atc or the desktop app on 1337.
  const own = await adminSession((dataFolder) =>
    writeFileSync(
      join(dataFolder, 'atc', 'config.json'),
      JSON.stringify({ version: 5, api: { port: 0, autoStart: false } })
    )
  )
  try {
    expect(own.atc('control', 'call', 'setup.manual', '--json').code).toBe(0)
    await own.page.reload()
    await own.page.getByRole('button', { name: 'Server', exact: true }).click()
    await own.page.getByRole('button', { name: 'Start API' }).click()
    const running = () =>
      (JSON.parse(own.atc('status', '--json').out) as { api: { running: boolean } }).api.running
    await expect.poll(running, { timeout: 20_000 }).toBe(true)
    await expect.poll(() => own.page.getByRole('button', { name: 'Stop API' }).count()).toBe(1)
  } finally {
    await own.close()
  }
})
