/** The built studio against the audio-capable core's cancellation contract; no engine is started. */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { adminSession } from '../helpers/admin-browser.js'
import type { AdminSession } from '../helpers/admin-browser.js'

let s: AdminSession
const model = { modelId: 'stable-audio-3-small-sfx:q8_0', displayName: 'Stable Audio', mode: 'effects' }
const requests: unknown[] = []
let resident = true
let job = { id: 'clip', state: 'cancelled' }

beforeAll(async () => {
  s = await adminSession()
  expect(s.atc('control', 'call', 'setup.manual', '--json').code).toBe(0)
  await s.page.route('**/api/workspace', async (route) => {
    const response = await route.fetch()
    const snapshot = await response.json()
    await route.fulfill({
      response,
      json: {
        ...snapshot,
        captured_at: Date.now(),
        services: resident
          ? [
              {
                id: 'audio',
                provider: 'audio-cpp',
                model: model.modelId,
                kind: 'audio',
                state: 'loaded',
                details: {
                  model: { state: 'loaded', loaded: model },
                  activeJob: job.state === 'generating' ? job : null,
                },
              },
            ]
          : [],
        setups: [
          {
            id: 'download',
            stage: 'ready',
            plan: {
              category: 'audio',
              model_id: model.modelId,
              name: model.displayName,
              audio: {
                mode: 'effects',
                attribution: null,
                controls: ['durationSec', 'seed'],
                defaults: { durationSec: 5, seed: 42 },
                ranges: { durationSec: [1, 30] },
              },
            },
          },
        ],
      },
    })
  })
  await s.page.route('**/api/workspace/execute', async (route) => {
    const { operation, input } = route.request().postDataJSON() as { operation: string; input: unknown }
    let json: unknown
    switch (operation) {
      case 'audio.capabilities':
        json = { modelId: model.modelId, mode: model.mode, voices: [] }
        break
      case 'audio.gallery':
        json = { items: [] }
        break
      case 'audio.generate':
        requests.push(input)
        resident = true
        job = { id: 'clip', state: 'generating' }
        json = job
        break
      case 'audio.cancel':
        resident = false
        job = { id: 'clip', state: 'cancelled' }
        json = { cancelled: true, serverStopped: true }
        break
      case 'audio.job':
        json = { job }
        break
      default:
        await route.continue()
        return
    }
    await route.fulfill({ json })
  })
  await s.page.reload()
  await s.page.getByRole('button', { name: 'Playground', exact: true }).click()
  await s.page.getByRole('button', { name: 'Audio', exact: true }).click()
})
afterAll(() => s?.close())

it('preserves the form after Stop and recovers the retained model after reloading the studio', async () => {
  const page = s.page
  await page.getByRole('textbox', { name: 'Describe the sound' }).fill('A soft click')
  await page.getByRole('spinbutton', { name: 'Length (seconds)' }).fill('7')
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  await page.getByRole('button', { name: 'Stop', exact: true }).click()
  await page.getByRole('button', { name: 'Stop generation', exact: true }).click()
  await expect.poll(() => page.getByRole('button', { name: 'Generate', exact: true }).isEnabled()).toBe(true)
  expect(await page.getByRole('textbox', { name: 'Describe the sound' }).inputValue()).toBe('A soft click')
  expect(await page.getByRole('spinbutton', { name: 'Length (seconds)' }).inputValue()).toBe('7')
  expect(await page.getByRole('button', { name: 'Stable Audio', exact: true }).isVisible()).toBe(true)
  await page.reload()
  await page.getByRole('button', { name: 'Playground', exact: true }).click()
  await page.getByRole('button', { name: 'Audio', exact: true }).click()
  await page.getByRole('textbox', { name: 'Describe the sound' }).fill('Another soft click')
  await page.getByRole('button', { name: 'Generate', exact: true }).click()
  expect(requests).toEqual([
    { mode: 'effects', request: { text: 'A soft click', durationSec: 7, seed: 42 } },
    { mode: 'effects', request: { text: 'Another soft click', durationSec: 5, seed: 42 } },
  ])
})
