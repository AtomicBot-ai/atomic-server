import { expect, it, vi } from 'vitest'
import { cloudAction } from './cloud-actions.js'
import { createWorkspace } from '../state.js'
import { workspaceFrame } from '../frame.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
function fixture(message = '') {
  let state = createWorkspace('welcome')
  state.firstRun = 'cloud'
  state.overlay = null
  state.cloud = {
    ...state.cloud,
    editing: true,
    optionsOpen: true,
    provider: 'openai',
    url: 'https://provider.example/v1',
    models: 'one',
    key: 'private-fixture',
  }
  let fail = Boolean(message)
  const execute = vi.fn(async (name: string) => {
    if (fail) throw new Error(message)
    return name === 'cloud.list'
      ? { providers: [{ provider: 'openai', connected: true }] }
      : { provider: 'openai', connected: true }
  })
  const ctx = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: { runtime: { execute } } as unknown as WorkspaceController,
  } as ActionContext
  return {
    ctx,
    execute,
    get: () => state,
    allow: () => {
      fail = false
    },
    action: (id: string) => cloudAction(id, ctx),
  }
}
it.each([
  'The provider rejected this API key. Check the key and try again.',
  'Could not reach the provider. Check its base URL and try again.',
  'This endpoint did not return an OpenAI-compatible model list.',
  'Model not available from this provider: requested-model.',
])('retains fields and exposes a failure before successful retry: %s', async (message) => {
  const t = fixture(message)
  await t.action('cloud-save')
  expect(t.get().cloud).toMatchObject({
    editing: true,
    checking: false,
    error: message,
    key: 'private-fixture',
    models: 'one',
    url: 'https://provider.example/v1',
    providers: [],
  })
  const frame = workspaceFrame(t.get(), 54, 24, 0)
  const rendered = frame.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
  expect(rendered).toContain(message.slice(0, 30))
  expect(rendered).not.toContain('private-fixture')
  expect(rendered).not.toContain('[Connected]')
  expect(frame.targets.find((target) => target.id === 'cloud-save')).toBeDefined()
  t.allow()
  await t.action('cloud-save')
  expect(t.get().cloud).toMatchObject({
    editing: true,
    key: '',
    error: '',
    providers: [{ provider: 'openai', connected: true }],
  })
})
it.each([
  ['', 'https://provider.example', 'Enter a provider name'],
  ['fixture', '', 'Enter a valid HTTP or HTTPS'],
  ['fixture', 'not-a-url', 'Enter a valid HTTP or HTTPS'],
  ['fixture', 'ftp://provider.example', 'without credentials'],
  ['fixture', 'https://user:secret@provider.example/v1', 'without credentials'],
])('validates missing or invalid provider fields before checking (%s, %s)', async (provider, url, error) => {
  const t = fixture()
  t.ctx.update((s) => ({ ...s, cloud: { ...s.cloud, provider, url } }))
  await t.action('cloud-save')
  expect(t.get().cloud.error).toContain(error)
  expect(t.get().cloud.editing).toBe(true)
  expect(t.execute).not.toHaveBeenCalled()
})
it.each([
  [54, 24],
  [120, 36],
])('keeps native-provider guidance and failure fields readable at %sx%s', async (width, height) => {
  const t = fixture()
  await t.action('cloud-choice:1')
  t.ctx.update((s) => ({ ...s, cloud: { ...s.cloud, key: 'fixture' } }))
  await t.action('cloud-save')
  const frame = workspaceFrame(t.get(), width!, height!, 0)
  const rendered = frame.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
  expect(rendered).toContain('OpenAI-compatible gateway')
  expect(frame.targets.find((target) => target.id === 'cloud-url')?.hint).toContain(
    'The native Anthropic API is not supported here.'
  )
  expect(rendered).toContain('Enter a valid HTTP or HTTPS')
  const input = frame.targets.find((target) => target.id === 'cloud-models')!
  const submit = frame.targets.find((target) => target.id === 'cloud-save')!
  expect(input.y).toBeGreaterThan(submit.y + submit.height)
  expect(input.y + input.height).toBeLessThan(height! - 2)
  expect(submit.y + submit.height).toBeLessThan(height! - 2)
})
it('shows provider-list errors on the originating page', async () => {
  const t = fixture('Could not refresh cloud providers. Try again.')
  t.ctx.update((s) => ({ ...s, firstRun: null, page: 'models' }))
  await t.action('library:cloud')
  const rendered = workspaceFrame(t.get(), 80, 30, 0)
    .cells.flat()
    .map((cell) => cell.char)
    .join('')
  expect(rendered).toContain('Could not refresh cloud providers')
  expect(rendered).not.toContain('[Connected]')
  expect(workspaceFrame(t.get(), 80, 30, 0).targets.some((target) => target.id === 'cloud-refresh')).toBe(
    true
  )
  t.allow()
  await t.action('cloud-refresh')
  expect(t.get().cloud.error).toBe('')
})
