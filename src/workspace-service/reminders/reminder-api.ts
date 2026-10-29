import { retryAfterMs } from './reminder-policy.js'

/** Atomic's reminder service (repository atomic-chat-backend): one email once a model is ready. */
export const REMINDER_API = 'https://api.atomic.chat/v1/reminders'
export const REMINDER_TIMEOUT_MS = 15_000

/** The service answered with another status than the call's own. Its body is never read: it can echo the address. */
export class ReminderApiError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterMs = 0
  ) {
    super(`The reminder service answered HTTP ${status}.`)
    this.name = 'ReminderApiError'
  }
}

export interface ReminderRegistration {
  email: string
  locale: string
  model_name: string
  app_version: string
  platform?: string
}

async function call(
  request: typeof fetch,
  token: string,
  path: '' | '/notify',
  method: 'PUT' | 'POST',
  body: ReminderRegistration | { model_name: string },
  now: () => number
): Promise<void> {
  // A timeout or a refused connection is a plain error: the caller retries it; only an answer is final.
  const response = await request(`${REMINDER_API}${path}`, {
    method,
    headers: { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    redirect: 'error',
    signal: AbortSignal.timeout(REMINDER_TIMEOUT_MS),
  })
  await response.body?.cancel().catch(() => undefined)
  if (response.status !== (method === 'PUT' ? 204 : 202))
    throw new ReminderApiError(response.status, retryAfterMs(response.headers.get('retry-after'), now()))
}

/** `PUT /v1/reminders` → 204: the token's address and model; the same address again replaces its record. */
export const registerReminder = (
  request: typeof fetch,
  token: string,
  registration: ReminderRegistration,
  now: () => number = Date.now
): Promise<void> => call(request, token, '', 'PUT', registration, now)

/** `POST /v1/reminders/notify` → 202: the model is ready; repeating it sends no second email. */
export const notifyReminder = (
  request: typeof fetch,
  token: string,
  modelName: string,
  now: () => number = Date.now
): Promise<void> => call(request, token, '/notify', 'POST', { model_name: modelName }, now)
