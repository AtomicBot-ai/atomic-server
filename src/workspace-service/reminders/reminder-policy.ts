import type { WorkspaceReminder } from '../../contract/index.js'
import { connectionDownload } from '../../workspace-view/index.js'

/**
 * What the server keeps for the model-ready email (ADR 2026-10-29-the-server-sends-the-model-ready-email):
 * the random install token the reminder service knows it by, and what it waits for. Never the address.
 */
export interface ReminderIntent extends WorkspaceReminder {
  /** The download finished once; a quit or a lost answer retries only the notification. */
  ready: boolean
  attempts: number
  next_attempt_at: number
}
export interface ReminderDocument {
  token: string | null
  reminder: ReminderIntent | null
}
export const EMPTY_REMINDERS: ReminderDocument = { token: null, reminder: null }

/** The service keeps a registration 30 days; so does the server. */
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const RETRY_MS = 2 * 60 * 1000
const MAX_RETRY_MS = 30 * 60 * 1000
const STATUSES = ['waiting', 'queued', 'expired', 'failed']
const DONE = ['ready', 'complete', 'completed', 'succeeded', 'success', 'done']
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Row = Record<string, unknown>
const record = (value: unknown): Row =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {}

/** A damaged or foreign file reads as no reminder, never as a credential of the wrong shape. */
export function parseReminderDocument(raw: unknown): ReminderDocument {
  const data = record(raw)
  if (typeof data['token'] !== 'string' || !TOKEN.test(data['token'])) return EMPTY_REMINDERS
  const r = record(data['reminder']),
    valid =
      typeof r['setup_id'] === 'string' &&
      typeof r['model'] === 'string' &&
      typeof r['model_name'] === 'string' &&
      typeof r['ready'] === 'boolean' &&
      [r['registered_at'], r['attempts'], r['next_attempt_at']].every(Number.isFinite) &&
      Number(r['attempts']) >= 0 &&
      STATUSES.includes(String(r['status']))
  return { token: data['token'], reminder: valid ? (r as unknown as ReminderIntent) : null }
}

/** The address as the service takes it, or null when it cannot be one. */
export function reminderEmail(value: unknown): string | null {
  const email = typeof value === 'string' ? value.trim() : ''
  return email.length <= 320 && EMAIL.test(email) ? email : null
}

/** The download a reminder waits for: the named model's, else the latest text model download. */
export function reminderTarget(setups: readonly unknown[], model = '') {
  const job = connectionDownload(setups, model)
  if (!job || DONE.includes(String(job['stage'] ?? job['state'] ?? ''))) return null
  const plan = record(job['plan']),
    id = String(job['model_id'] ?? plan['model_id'] ?? plan['repository'] ?? plan['variant_id'] ?? model)
  return { setup_id: String(job['setup_id'] ?? job['id'] ?? ''), model: id }
}

/** The model as the email names it: the name a client showed, else the model id without its owner. */
export function reminderModelName(name: unknown, model: string): string {
  const shown = typeof name === 'string' ? name.trim() : ''
  return (shown || model.split('/').pop() || model).slice(0, 200)
}

/** Its download is done: the setup it registered for, or the latest one of its model. */
export function reminderModelReady(setups: readonly unknown[], reminder: ReminderIntent): boolean {
  const rows = setups.map(record),
    job =
      rows.find((row) => String(row['setup_id'] ?? row['id'] ?? '') === reminder.setup_id) ??
      connectionDownload(setups, reminder.model)
  return Boolean(job && DONE.includes(String(job['stage'] ?? job['state'] ?? '')))
}

/** The attempt about to be sent, saved first with its backoff: 2, 4, 8, 16, then every 30 minutes. */
export function nextAttempt(reminder: ReminderIntent, now: number): ReminderIntent {
  return {
    ...reminder,
    ready: true,
    attempts: reminder.attempts + 1,
    next_attempt_at: now + Math.min(MAX_RETRY_MS, RETRY_MS * 2 ** Math.min(reminder.attempts, 4)),
  }
}

/**
 * After a notification: `202` queues it; `429` waits as long as the service asks; another 4xx (but 408)
 * ends it, `404` meaning the registration is gone; a 5xx, 408 or no answer keeps the backoff and retries.
 */
export function afterNotify(
  attempt: ReminderIntent,
  failure: { status: number; retryAfterMs: number } | null,
  now: number
): ReminderIntent {
  if (!failure) return { ...attempt, status: 'queued' }
  if (failure.status === 429)
    return { ...attempt, next_attempt_at: Math.max(attempt.next_attempt_at, now + failure.retryAfterMs) }
  if (failure.status >= 400 && failure.status < 500 && failure.status !== 408)
    return { ...attempt, status: failure.status === 404 ? 'expired' : 'failed' }
  return attempt
}

/** `Retry-After` in seconds or as an HTTP date, as milliseconds from now; 0 when absent or unreadable. */
export function retryAfterMs(header: string | null, now: number): number {
  if (!header) return 0
  const seconds = Number(header),
    ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now
  return Number.isFinite(ms) ? Math.max(0, ms) : 0
}

/** What the snapshot shows of it. */
export function reminderView(reminder: ReminderIntent | null): WorkspaceReminder | null {
  if (!reminder) return null
  const { setup_id, model, model_name, status, registered_at } = reminder
  return { setup_id, model, model_name, status, registered_at }
}
