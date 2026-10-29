import { describe, expect, it } from 'vitest'
import {
  afterNotify,
  nextAttempt,
  parseReminderDocument,
  reminderEmail,
  reminderModelName,
  reminderModelReady,
  reminderTarget,
  retryAfterMs,
  type ReminderIntent,
} from './reminder-policy.js'

const TOKEN = 'a'.repeat(43)
const intent: ReminderIntent = {
  setup_id: 's1',
  model: 'unsloth/Qwen3-4B',
  model_name: 'Qwen3 4B',
  status: 'waiting',
  registered_at: 1,
  ready: false,
  attempts: 0,
  next_attempt_at: 0,
}
const job = (stage: string, extra: Record<string, unknown> = {}) => ({
  setup_id: 's1',
  stage,
  plan: { model_id: 'unsloth/Qwen3-4B' },
  updated_at: 1,
  ...extra,
})

describe('parseReminderDocument', () => {
  it.each([
    ['nothing', null, { token: null, reminder: null }],
    ['a short token', { token: 'short', reminder: intent }, { token: null, reminder: null }],
    ['a token alone', { token: TOKEN }, { token: TOKEN, reminder: null }],
    [
      'a damaged reminder',
      { token: TOKEN, reminder: { ...intent, attempts: -1 } },
      { token: TOKEN, reminder: null },
    ],
    [
      'an unknown status',
      { token: TOKEN, reminder: { ...intent, status: 'sent' } },
      { token: TOKEN, reminder: null },
    ],
    ['a whole document', { token: TOKEN, reminder: intent }, { token: TOKEN, reminder: intent }],
  ])('reads %s', (_, raw, expected) => expect(parseReminderDocument(raw)).toEqual(expected))
})

it.each([
  [' me@example.com ', 'me@example.com'],
  ['me@example', null],
  ['two words@example.com', null],
  [`${'a'.repeat(320)}@example.com`, null],
  [42, null],
])('takes %j as the address %j', (raw, expected) => expect(reminderEmail(raw)).toBe(expected))

it('waits for the latest text download, never a finished one or a media file', () => {
  expect(reminderTarget([job('downloading_model')])).toEqual({ setup_id: 's1', model: 'unsloth/Qwen3-4B' })
  expect(reminderTarget([job('ready')])).toBeNull()
  expect(
    reminderTarget([job('downloading_model', { plan: { model_id: 'flux', category: 'image' } })])
  ).toBeNull()
  expect(reminderTarget([job('downloading_model')], 'other/model')).toBeNull()
})

it('names the model as a client showed it, else by its id without the owner', () => {
  expect(reminderModelName(' Qwen3 4B ', 'unsloth/Qwen3-4B')).toBe('Qwen3 4B')
  expect(reminderModelName(undefined, 'unsloth/Qwen3-4B')).toBe('Qwen3-4B')
  expect(reminderModelName('x'.repeat(300), 'm')).toHaveLength(200)
})

it('is ready once its setup or the latest setup of its model is done', () => {
  expect(reminderModelReady([job('downloading_model')], intent)).toBe(false)
  expect(reminderModelReady([job('ready')], intent)).toBe(true)
  expect(reminderModelReady([job('completed', { setup_id: 's2' })], intent)).toBe(true)
  expect(reminderModelReady([], intent)).toBe(false)
})

it('backs off 2, 4, 8, 16, then 30 minutes', () => {
  const minutes = [0, 1, 2, 3, 4, 8].map(
    (attempts) => nextAttempt({ ...intent, attempts }, 0).next_attempt_at / 60_000
  )
  expect(minutes).toEqual([2, 4, 8, 16, 30, 30])
  expect(nextAttempt(intent, 0)).toMatchObject({ ready: true, attempts: 1 })
})

describe('afterNotify', () => {
  const attempt = { ...intent, ready: true, attempts: 1, next_attempt_at: 1_000 }
  it.each([
    ['202', null, 'queued'],
    ['429', { status: 429, retryAfterMs: 5_000 }, 'waiting'],
    ['404', { status: 404, retryAfterMs: 0 }, 'expired'],
    ['401', { status: 401, retryAfterMs: 0 }, 'failed'],
    ['408', { status: 408, retryAfterMs: 0 }, 'waiting'],
    ['503', { status: 503, retryAfterMs: 0 }, 'waiting'],
  ])('after %s it is %s', (_, failure, status) =>
    expect(afterNotify(attempt, failure, 100).status).toBe(status)
  )
  it('waits as long as a 429 asks, never less than the backoff', () => {
    expect(afterNotify(attempt, { status: 429, retryAfterMs: 5_000 }, 100).next_attempt_at).toBe(5_100)
    expect(afterNotify(attempt, { status: 429, retryAfterMs: 0 }, 100).next_attempt_at).toBe(1_000)
  })
})

it.each([
  [null, 0],
  ['120', 120_000],
  ['-5', 0],
  ['Thu, 29 Oct 2026 12:00:10 GMT', 10_000],
  ['soon', 0],
])('reads Retry-After %j as %i ms', (header, ms) =>
  expect(retryAfterMs(header, Date.parse('Thu, 29 Oct 2026 12:00:00 GMT'))).toBe(ms)
)
