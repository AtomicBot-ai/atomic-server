import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EmailReminders } from './email-reminders.js'
import { REMINDER_API } from './reminder-api.js'

let folder = ''
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'atc-reminders-'))
})
afterEach(() => rm(folder, { recursive: true, force: true }))

const downloading = (stage = 'downloading_model') => [
  { setup_id: 's1', stage, plan: { model_id: 'unsloth/Qwen3-4B' }, updated_at: 1 },
]

function fixture(answers: Array<number | Error>, start = downloading()) {
  let setups: unknown[] = start,
    now = 1_000
  const calls: Array<{ url: string; method: string; auth: string; body: Record<string, unknown> }> = []
  const request = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string>
    calls.push({
      url: String(url),
      method: String(init?.method),
      auth: headers['authorization'] ?? '',
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    })
    const answer = answers.shift() ?? 500
    if (answer instanceof Error) throw answer
    return new Response(null, { status: answer, headers: answer === 429 ? { 'retry-after': '600' } : {} })
  })
  const make = () =>
    new EmailReminders({
      atcDir: folder,
      fetch: request as typeof fetch,
      setups: async () => setups,
      platform: 'linux',
      now: () => now,
    })
  return {
    calls,
    request,
    make,
    reminders: make(),
    finish: () => (setups = downloading('ready')),
    later: (ms: number) => (now += ms),
  }
}

it('registers once, keeps no address, and tells the service when the download is done', async () => {
  const t = fixture([204, 202])
  const view = await t.reminders.request({ email: ' me@example.com ', model_name: 'Qwen3 4B' })
  expect(view).toMatchObject({
    setup_id: 's1',
    model: 'unsloth/Qwen3-4B',
    model_name: 'Qwen3 4B',
    status: 'waiting',
  })
  expect(t.calls[0]).toMatchObject({
    url: REMINDER_API,
    method: 'PUT',
    body: { email: 'me@example.com', locale: 'en', model_name: 'Qwen3 4B', platform: 'atc-linux' },
  })
  expect(t.calls[0]!.auth).toMatch(/^Bearer [A-Za-z0-9_-]{43}$/)
  const file = join(folder, 'email-reminder.json'),
    saved = await readFile(file, 'utf8')
  expect(saved).not.toContain('example.com')
  expect(saved).toContain(t.calls[0]!.auth.slice(7))
  if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o600)

  await t.reminders.sync()
  expect(t.calls).toHaveLength(1)
  t.finish()
  await t.reminders.sync()
  expect(t.calls[1]).toMatchObject({
    url: `${REMINDER_API}/notify`,
    method: 'POST',
    auth: t.calls[0]!.auth,
    body: { model_name: 'Qwen3 4B' },
  })
  expect(t.reminders.view()?.status).toBe('queued')
  t.later(60 * 60_000)
  await t.reminders.sync()
  expect(t.calls).toHaveLength(2)
})

it('retries a lost notification after a restart, even once the download is no longer listed', async () => {
  const t = fixture([204, new Error('connect ETIMEDOUT'), 503, 202])
  await t.reminders.request({ email: 'me@example.com' })
  t.finish()
  await t.reminders.sync()
  expect(t.reminders.view()?.status).toBe('waiting')
  await t.reminders.sync()
  expect(t.calls).toHaveLength(2)
  const restarted = t.make()
  t.later(2 * 60_000)
  await restarted.sync()
  expect(restarted.view()?.status).toBe('waiting')
  t.later(4 * 60_000)
  await restarted.sync()
  expect(t.calls.map((call) => call.method)).toEqual(['PUT', 'POST', 'POST', 'POST'])
  expect(restarted.view()?.status).toBe('queued')
})

it.each([
  [422, 'ATC_USAGE', 'Check the email address'],
  [429, 'ATC_USAGE', 'Too many requests'],
  [500, 'ATC_INTERNAL', 'internet connection'],
  [new Error('getaddrinfo ENOTFOUND'), 'ATC_INTERNAL', 'internet connection'],
])('shows a failed registration (%s) and drops the earlier reminder', async (answer, code, message) => {
  const t = fixture([204, answer])
  await t.reminders.request({ email: 'old@example.com' })
  const error = await t.reminders.request({ email: 'new@example.com' }).catch((e: unknown) => e)
  expect(error).toMatchObject({ code, message: expect.stringContaining(message) })
  expect(JSON.stringify(error)).not.toContain('example.com')
  expect(t.reminders.view()).toBeNull()
  // The same token again: the service replaces the address it had for this install.
  expect(t.calls[1]!.auth).toBe(t.calls[0]!.auth)
})

it('asks the service nothing for an address it cannot take or with no download to wait for', async () => {
  const t = fixture([], downloading('ready'))
  await expect(t.reminders.request({ email: 'not an address' })).rejects.toThrow('valid email')
  await expect(t.reminders.request({ email: 'me@example.com' })).rejects.toThrow('No model is downloading')
  expect(t.request).not.toHaveBeenCalled()
})

it('ends a reminder the service no longer knows, or one older than 30 days', async () => {
  const gone = fixture([204, 404])
  await gone.reminders.request({ email: 'me@example.com' })
  gone.finish()
  await gone.reminders.sync()
  expect(gone.reminders.view()?.status).toBe('expired')

  const old = fixture([204])
  await old.reminders.request({ email: 'me@example.com' })
  old.later(31 * 24 * 60 * 60_000)
  old.finish()
  await old.reminders.sync()
  expect(old.reminders.view()?.status).toBe('expired')
  expect(old.calls).toHaveLength(1)
})
