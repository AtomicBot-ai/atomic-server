/**
 * The web admin's Models and command dock on the built program, where this change found bugs: LiteRT-LM in
 * the Local models catalog (format, families, variants inline, the engine's own dialog), LiteRT-LM inside
 * Engine settings (no plain build install around openvino), and a confirmation before a command that runs
 * a connector program on the server's host.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { adminSession } from '../helpers/admin-browser.js'
import type { AdminSession } from '../helpers/admin-browser.js'

let s: AdminSession
beforeAll(async () => {
  s = await adminSession()
  expect(s.atc('control', 'call', 'setup.manual', '--json').code).toBe(0)
  await s.page.reload()
  await s.page.getByRole('button', { name: 'Models', exact: true }).click()
})
afterAll(() => s?.close())

it('lists LiteRT-LM families with their variants inline and opens the engine’s own dialog', async () => {
  const page = s.page
  await page.getByRole('button', { name: 'Filters' }).click()
  const formats = page.locator('fieldset', { has: page.getByText('Format', { exact: true }) })
  await formats.getByRole('radio', { name: 'LiteRT-LM', exact: true }).check()
  await page.keyboard.press('Escape')
  await page.getByText('Gemma 4 E4B', { exact: true }).first().click()
  await expect.poll(() => page.getByLabel('Variant').inputValue()).toBe('gemma-4-e4b-gpu')
  await page.getByRole('button', { name: 'Install LiteRT-LM' }).click()
  await expect.poll(() => page.getByRole('dialog', { name: 'LiteRT-LM' }).isVisible()).toBe(true)
  await page.getByRole('dialog', { name: 'LiteRT-LM' }).getByRole('button', { name: 'Close' }).click()
})

it('shows LiteRT-LM’s own controls inside its Engine settings, without a build install around openvino', async () => {
  const page = s.page
  await page.getByRole('button', { name: 'Inference engines' }).click()
  const card = page.getByRole('heading', { name: 'LiteRT-LM', level: 2 }).locator('xpath=..')
  await card.getByRole('button', { name: 'Engine settings' }).click()
  const dialog = page.getByRole('dialog', { name: 'litert-lm settings' })
  await expect.poll(() => dialog.getByRole('region', { name: 'LiteRT-LM' }).isVisible()).toBe(true)
  expect(await dialog.getByRole('button', { name: 'Install latest build' }).count()).toBe(0)
  await dialog.getByRole('button', { name: 'Close' }).first().click()
})

it('asks before the command dock runs a connector program on the server’s host', async () => {
  const page = s.page
  await page.getByRole('button', { name: 'Help', exact: true }).click()
  await page.getByRole('button', { name: /Commands/ }).click()
  await page.getByLabel('Command', { exact: true }).selectOption('connectors.check')
  await page.getByLabel('id *', { exact: true }).fill('local-tool')
  await page.getByRole('button', { name: 'Connect MCP' }).click()
  const confirm = page.getByRole('dialog', { name: 'Connect MCP?' })
  await expect.poll(() => confirm.textContent()).toContain('runs a program on the server’s host')
  await confirm.getByRole('button', { name: 'Cancel' }).click()
  expect(await confirm.count()).toBe(0)
})
