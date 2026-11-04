/** Shared layout at desktop, compact and 200%-equivalent CSS viewport sizes. No engines are run. */
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { adminSession } from '../helpers/admin-browser.js'
import type { AdminSession } from '../helpers/admin-browser.js'

let s: AdminSession
beforeAll(async () => {
  s = await adminSession()
  s.page.setDefaultTimeout(10000)
  expect(s.atc('control', 'call', 'setup.manual', '--json').code).toBe(0)
  await s.page.route('**/api/workspace', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      json: {
        ...(await response.json()),
        setups: [
          { id: 'one', stage: 'downloading', plan: { model_id: 'one', name: 'Image model' } },
          { id: 'two', stage: 'downloading', plan: { model_id: 'two', name: 'Audio model' } },
        ],
      },
    })
  })
  await s.page.route('**/api/workspace/execute', async (route) => {
    const { operation } = route.request().postDataJSON()
    if (operation === 'artifacts.list') {
      await route.fulfill({
        json: Array.from({ length: 20 }, (_, i) => ({
          id: String(i),
          stage: 'ready',
          plan: { model_id: `image-${i}`, name: `Image ${i}`, category: 'image' },
        })),
      })
    } else if (operation === 'media.image.gallery') await route.fulfill({ json: [] })
    else await route.continue()
  })
})
afterAll(() => s?.close())
beforeEach(async () => {
  await s.page.setViewportSize({ width: 1280, height: 900 })
  await s.page.reload()
  await s.page.getByRole('button', { name: 'Server', exact: true }).waitFor()
})

async function screenshot(name: string) {
  if (process.env['ATC_WEB_UI_SCREENSHOT_DIR'])
    await s.page.screenshot({
      path: `${process.env['ATC_WEB_UI_SCREENSHOT_DIR']}/${name}.png`,
      fullPage: true,
    })
}

it.each(['light', 'dark'])(
  'uses compact shared controls in %s appearance with a download active',
  async (theme) => {
    const page = s.page
    await page.getByRole('button', { name: 'Settings', exact: true }).click()
    await page.getByRole('button', { name: 'Interface', exact: true }).click()
    await page.getByLabel('Theme', { exact: true }).selectOption(theme)
    const header = await page.locator('.desktop-topbar').boundingBox()
    expect(header!.height).toBe(52)
    expect((await page.locator('.desktop-rail').boundingBox())!.width).toBe(72)
    expect((await page.locator('.desktop-sidebar').boundingBox())!.width).toBe(240)
    expect((await page.getByRole('button', { name: 'Reset', exact: true }).boundingBox())!.height).toBe(36)
    expect((await page.getByLabel('Theme', { exact: true }).boundingBox())!.height).toBe(36)
    expect(
      await page.getByRole('button', { name: 'Reset', exact: true }).getAttribute('class')
    ).not.toContain('danger')
    expect(await page.getByRole('heading', { level: 1 }).count()).toBe(1)
    const title = await page.getByRole('heading', { level: 1 }).boundingBox()
    expect(title!.y - header!.height).toBe(24)
    const panel = await page.getByRole('region', { name: 'Interface appearance' }).boundingBox()
    expect(panel!.y - (title!.y + title!.height)).toBe(24)
    const reset = await page.getByRole('button', { name: 'Reset', exact: true }).boundingBox()
    expect(reset!.y + reset!.height).toBeLessThan(900)
    await page.getByLabel('Theme', { exact: true }).focus()
    await page.keyboard.press('Tab')
    const focus = await page.getByRole('button', { name: 'Reset', exact: true }).evaluate((element) => {
      const style = (
        globalThis as unknown as {
          getComputedStyle(element: unknown): {
            outlineWidth: string
            outlineOffset: string
            outlineStyle: string
          }
        }
      ).getComputedStyle(element)
      return { width: style.outlineWidth, offset: style.outlineOffset, style: style.outlineStyle }
    })
    expect(focus).toEqual({ width: '2px', offset: '2px', style: 'solid' })
    await screenshot(`interface-${theme}`)
    await page.getByRole('button', { name: 'View downloads' }).click()
    expect(await page.getByRole('dialog', { name: 'Downloads', exact: true }).isVisible()).toBe(true)
    await page.keyboard.press('Escape')
  }
)

it.each([
  { width: 1024, height: 768 },
  { width: 512, height: 384 },
])('reflows media at $width px and preserves typing and dialog focus', async (viewport) => {
  const page = s.page
  await page.setViewportSize(viewport)
  await expect
    .poll(() => page.getByRole('button', { name: 'Toggle sidebar' }).getAttribute('aria-expanded'))
    .toBe('false')
  await page.getByRole('button', { name: 'Playground', exact: true }).click()
  await page.getByRole('button', { name: 'Images', exact: true }).click()
  expect(await page.getByRole('button', { name: 'Toggle sidebar' }).getAttribute('aria-expanded')).toBe(
    'false'
  )
  const draft = page.getByRole('textbox', { name: 'Prompt', exact: true })
  await draft.fill('Keep this draft')
  await page.keyboard.press('Alt+Digit1')
  expect(
    await page.getByRole('button', { name: 'Playground', exact: true }).getAttribute('aria-current')
  ).toBe('page')
  const overflow = await page
    .locator('.desktop-main')
    .evaluate(
      (el) =>
        (el as unknown as { scrollWidth: number }).scrollWidth >
        (el as unknown as { clientWidth: number }).clientWidth
    )
  expect(overflow).toBe(false)
  const generate = page.getByRole('button', { name: 'Generate', exact: true })
  await generate.scrollIntoViewIfNeeded()
  expect((await generate.boundingBox())!.height).toBe(40)
  expect(
    await generate.evaluate(
      (el) =>
        (
          globalThis as unknown as { getComputedStyle(element: unknown): { borderRadius: string } }
        ).getComputedStyle(el).borderRadius
    )
  ).toBe('8px')
  expect(await generate.isVisible()).toBe(true)
  const trigger = page.getByRole('button', { name: 'Choose image model', exact: true }).first()
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: 'Choose image model' })
  await dialog.getByText('Image 19', { exact: true }).waitFor({ state: 'attached' })
  const bounds = await dialog.boundingBox()
  expect(bounds!.width).toBeLessThanOrEqual(Math.min(560, viewport.width - 32))
  expect(bounds!.height).toBeLessThanOrEqual(viewport.height - 48)
  const browse = await dialog.getByRole('button', { name: 'Browse models' }).boundingBox()
  expect(browse!.y + browse!.height).toBeLessThanOrEqual(bounds!.y + bounds!.height)
  await page.keyboard.press('Alt+Digit1')
  expect(await dialog.isVisible()).toBe(true)
  await screenshot(`picker-${viewport.width}`)
  await page.keyboard.press('Escape')
  expect(
    await trigger.evaluate(
      (el) =>
        el === (globalThis as unknown as { document: { activeElement: unknown } }).document.activeElement
    )
  ).toBe(true)
  expect(await draft.inputValue()).toContain('Keep this draft')
  await screenshot(`media-${viewport.width}`)
})
