import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { adminSession } from '../helpers/admin-browser.js'

it('keeps both destination cards on Minesweeper when the selected engine has no model job yet', async () => {
  const s = await adminSession((folder) => {
    const directory = join(folder, 'atc', 'engine-downloads')
    mkdirSync(directory, { recursive: true })
    // API controls wait for the selected engine; unrelated engine transfers must not block them.
    writeFileSync(
      join(folder, 'atc', 'engine-choice.json'),
      JSON.stringify({ id: 'llamacpp-upstream|b1|cpu' })
    )
    writeFileSync(
      join(directory, 'engine.json'),
      JSON.stringify({
        id: 'engine',
        taskId: 'engine',
        kind: 'engine',
        engine: 'llamacpp-upstream',
        name: 'llama.cpp',
        target: { version: 'b1', variant: 'cpu' },
        stage: 'downloading',
        total: 100,
        transferred: 20,
        created_at: Date.now(),
        updated_at: Date.now(),
      })
    )
  })
  try {
    const page = s.page
    expect(JSON.parse(s.atc('control', 'watch', '--count', '1').out).snapshot.selection.engine).toBe(
      'llamacpp-upstream|b1|cpu'
    )
    await page.getByRole('button', { name: 'Skip setup', exact: true }).click()
    await page.getByRole('region', { name: 'Minesweeper' }).waitFor()
    for (const destination of ['Configure an endpoint', 'Connect an agent']) {
      await page.getByRole('button', { name: 'Back', exact: true }).click()
      const card = page.getByRole('button', { name: new RegExp(destination) })
      if (destination === 'Connect an agent') {
        await card.focus()
        await page.keyboard.press('Enter')
      } else await card.click()
      await page.getByRole('region', { name: 'Minesweeper' }).waitFor()
      expect(JSON.parse(s.atc('control', 'watch', '--count', '1').out).snapshot.setup?.complete).not.toBe(
        true
      )
    }
    await page.getByRole('button', { name: "I can't wait - take me to the control panel" }).click()
    await page.getByRole('dialog', { name: 'Set up Atomic Server' }).waitFor({ state: 'detached' })
    const waiting = page.getByRole('button', { name: 'Engine download paused', exact: true })
    await waiting.waitFor()
    expect(await waiting.getAttribute('aria-disabled')).toBe('true')
    await waiting.focus()
    await page.keyboard.press('Enter')
    await page.getByRole('status').filter({ hasText: 'Resume the engine download to continue.' }).waitFor()
    expect(await page.getByRole('button', { name: 'Stop API', exact: true }).count()).toBe(0)
    expect(JSON.parse(s.atc('control', 'watch', '--count', '1').out).snapshot.api.running).toBe(false)
    expect(s.atc('control', 'call', 'api.start', '--json').code).toBe(2)
  } finally {
    await s.close()
  }
})
