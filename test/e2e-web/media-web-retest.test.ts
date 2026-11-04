/** Browser fixtures exercise first load, live model discovery and layout without running an engine. */
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { adminSession } from '../helpers/admin-browser.js'
import type { AdminSession } from '../helpers/admin-browser.js'

let s: AdminSession
let loaded = '',
  ready = false,
  gallery = false
const requests: unknown[] = []
const prompt = 'A small green island. '.repeat(100)
const labels = { image: 'Images', video: 'Videos', audio: 'Audio' }
const model = (task: string) => ({
  id: task,
  stage: ready ? 'ready' : 'downloading',
  plan: {
    category: task,
    model_id: `${task}-model`,
    name: `${task} model`,
    audio: { mode: 'effects', controls: ['durationSec'], defaults: { durationSec: 5 }, ranges: {} },
  },
})

beforeAll(async () => {
  s = await adminSession()
  s.page.setDefaultTimeout(10000)
  expect(s.atc('control', 'call', 'setup.manual', '--json').code).toBe(0)
  await s.page.route('**/api/workspace', async (route) => {
    const response = await route.fetch()
    const snapshot = await response.json()
    await route.fulfill({
      response,
      json: {
        ...snapshot,
        captured_at: Date.now(),
        services: loaded
          ? [
              {
                id: loaded,
                kind: loaded === 'audio' ? 'audio' : 'image-video',
                provider: loaded === 'audio' ? 'audio-cpp' : 'sdcpp-server',
                model: `${loaded}-model`,
                state: 'loaded',
                details: {
                  model: { loaded: { modelId: `${loaded}-model`, modality: loaded, mode: 'effects' } },
                },
              },
            ]
          : [],
        setups: ['audio', 'image', 'video'].map(model),
      },
    })
  })
  await s.page.route('**/api/workspace/execute', async (route) => {
    const { operation, input } = route.request().postDataJSON()
    let json: unknown
    if (operation === 'artifacts.list') json = ['audio', 'image', 'video'].map(model)
    else if (operation === 'artifacts.load') {
      loaded = input.id
      json = {}
    } else if (operation === 'audio.capabilities') {
      if (loaded !== 'audio') {
        await route.fulfill({
          status: 409,
          json: { error: { code: 'MODEL_NOT_LOADED', message: 'No audio model' } },
        })
        return
      }
      json = { modelId: 'audio-model', mode: 'effects', voices: [] }
    } else if (operation === 'audio.gallery') json = { items: [] }
    else if (operation === 'media.capabilities' || operation === 'media.video.capabilities')
      json = { workflows: ['create'], defaults: { width: 512, height: 640, steps: 20 } }
    else if (operation === 'media.image.gallery' || operation === 'media.video.gallery')
      json = gallery ? [{ id: 'fixture', recipe: { prompt, width: 768, height: 512, steps: 12 } }] : []
    else if (operation === 'audio.generate' || /^media\.(image|video)\.create$/.test(operation)) {
      requests.push(input)
      json = { id: 'job', jobId: 'job', state: 'complete' }
    } else if (/^media\.(image|video)\.job$/.test(operation)) json = { id: 'job', state: 'complete' }
    else {
      await route.continue()
      return
    }
    await route.fulfill({ json })
  })
  await s.page.route('**/api/workspace/artifacts/image/*', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#277d68"/></svg>',
    })
  )
})
afterAll(() => s?.close())
afterEach(async (context) => {
  if (context.task.result?.state === 'fail' && process.env['ATC_WEB_RETEST_SCREENSHOT'])
    await s.page.screenshot({ path: process.env['ATC_WEB_RETEST_SCREENSHOT'], fullPage: true })
})
beforeEach(async () => {
  loaded = ''
  ready = false
  gallery = false
  requests.length = 0
  await s.page.setViewportSize({ width: 1280, height: 860 })
  await s.page.evaluate(() => localStorage.setItem('atc-admin:theme', 'light'))
  await s.page.reload()
})
async function studio(task: keyof typeof labels) {
  await s.page.getByRole('button', { name: 'Playground', exact: true }).click()
  await s.page.getByRole('button', { name: labels[task], exact: true }).click()
}

it.each(['audio', 'image', 'video'] as const)(
  'discovers a finished %s download in the open picker and retains the first draft',
  async (task) => {
    const page = s.page
    await studio(task)
    const field =
      task === 'audio'
        ? page.getByRole('textbox', { name: 'Text', exact: true })
        : page.getByRole('textbox', { name: 'Prompt', exact: true })
    await field.fill('Keep this first draft')
    if (task !== 'audio') await page.getByLabel('Width', { exact: true }).fill('768')
    await page
      .getByRole('button', { name: `Choose ${task} model`, exact: true })
      .first()
      .click()
    await page.getByText(`No ${task} models downloaded.`, { exact: true }).waitFor()
    ready = true
    await page.getByRole('button', { name: 'Load model', exact: true }).click()
    const draft = task === 'audio' ? page.getByLabel('Describe the sound') : field
    await expect
      .poll(() => page.getByRole('button', { name: 'Generate', exact: true }).isEnabled())
      .toBe(true)
    expect(await draft.inputValue()).toBe('Keep this first draft')
    if (task !== 'audio') {
      expect(await page.getByLabel('Width', { exact: true }).inputValue()).toBe('768')
      expect(await page.getByLabel('Height', { exact: true }).inputValue()).toBe('640')
    }
    await page.getByRole('button', { name: 'Generate', exact: true }).click()
    await expect.poll(() => requests.length).toBe(1)
    expect(requests[0]).toMatchObject({
      request:
        task === 'audio'
          ? { text: 'Keep this first draft', durationSec: 5 }
          : { prompt: 'Keep this first draft', width: 768, height: 640 },
    })
  }
)

it.each(['image', 'video'] as const)(
  'keeps a long %s recipe inside the viewport and restores its settings',
  async (task) => {
    loaded = task
    ready = true
    gallery = true
    const page = s.page
    await page.reload()
    await studio(task)
    // 512 x 384 CSS pixels is the reflow space of a 1024 x 768 window at 200% zoom.
    for (const viewport of [
      { width: 1280, height: 860 },
      { width: 1024, height: 768 },
      { width: 512, height: 384 },
    ]) {
      await page.setViewportSize(viewport)
      await page.getByRole('button', { name: 'Recipe', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Recipe', exact: true })
      const box = await dialog.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.y).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
      expect(box!.width).toBeLessThanOrEqual(Math.min(560, viewport.width - 32))
      const footer = await dialog.getByRole('button', { name: 'Restore settings' }).boundingBox()
      expect(footer!.y).toBeGreaterThanOrEqual(box!.y)
      expect(footer!.y + footer!.height).toBeLessThanOrEqual(box!.y + box!.height)
      if (viewport.width === 1280 && process.env['ATC_WEB_RETEST_SCREENSHOT'])
        await page.screenshot({
          path: process.env['ATC_WEB_RETEST_SCREENSHOT'].replace('.png', `-${task}-recipe.png`),
        })
      await dialog.getByRole('button', { name: 'Restore settings' }).click()
      expect(await page.getByRole('textbox', { name: 'Prompt', exact: true }).inputValue()).toBe(prompt)
      expect(await dialog.count()).toBe(0)
      await page.getByRole('button', { name: 'Recipe', exact: true }).click()
      await page.keyboard.press('Escape')
      expect(
        await page
          .getByRole('button', { name: 'Recipe', exact: true })
          .evaluate(
            (element) =>
              element ===
              (globalThis as unknown as { document: { activeElement: unknown } }).document.activeElement
          )
      ).toBe(true)
    }
  }
)

it('renders readable light controls and navigates using browser Alt key events', async () => {
  const page = s.page
  await page.getByRole('button', { name: 'Server', exact: true }).waitFor()
  await page.keyboard.press('Alt+Digit2')
  await expect
    .poll(() => page.getByRole('button', { name: 'Playground', exact: true }).getAttribute('aria-current'))
    .toBe('page')
  await page.getByRole('button', { name: 'Images', exact: true }).click()
  const colors = await page.evaluate(() => {
    const dom = globalThis as unknown as {
      document: { querySelector(selector: string): unknown }
      getComputedStyle(element: unknown): { color: string; backgroundColor: string }
    }
    const pair = (selector: string) => {
      const style = dom.getComputedStyle(dom.document.querySelector(selector))
      return [style.color, style.backgroundColor]
    }
    return {
      brand: pair('.workspace-brand'),
      rail: pair('.rail-item.active'),
      primary: pair('.media-generate-slot .primary'),
      download: pair('.floating-downloads .download-count'),
      guidance: pair('.media-controls .ew-muted'),
    }
  })
  expect(colors.brand[0]).toBe('rgb(32, 32, 35)')
  expect(colors.rail).toEqual(['rgb(35, 116, 96)', 'rgb(227, 240, 236)'])
  expect(colors.primary).toEqual(['rgb(255, 255, 255)', 'rgb(35, 116, 96)'])
  expect(colors.download).toEqual(['rgb(32, 32, 35)', 'rgb(227, 240, 236)'])
  expect(colors.guidance[0]).toBe('rgb(98, 98, 105)')
  if (process.env['ATC_WEB_RETEST_SCREENSHOT'])
    await page.screenshot({ path: process.env['ATC_WEB_RETEST_SCREENSHOT'], fullPage: true })
})
