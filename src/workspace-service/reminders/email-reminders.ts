import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { AtcError } from '../../errors/index.js'
import type { WorkspaceInput, WorkspaceReminder } from '../../contract/index.js'
import { readDocument, writeDocument } from '../../terminal-data/index.js'
import { ATC_VERSION } from '../../version.js'
import { SerialWork } from '../serial.js'
import { notifyReminder, registerReminder, ReminderApiError } from './reminder-api.js'
import {
  afterNotify,
  nextAttempt,
  parseReminderDocument,
  reminderEmail,
  reminderModelName,
  reminderModelReady,
  reminderTarget,
  reminderView,
  RETENTION_MS,
  type ReminderDocument,
} from './reminder-policy.js'

export interface EmailRemindersOptions {
  atcDir: string
  fetch: typeof fetch
  /** The setup rows a snapshot lists: what is downloading and what is done. */
  setups: () => Promise<readonly unknown[]>
  platform?: NodeJS.Platform
  now?: () => number
  pollMs?: number
}

const POLL_MS = 30_000

/**
 * The model-ready email, owned by the server: a client registers an address once (`setup.reminder`), and
 * the server tells the reminder service when that download is done, whether or not a client is open.
 * Registration and notification share one queue, so a new address never races a notification of the old.
 */
export class EmailReminders {
  private readonly path: string
  private readonly serial = new SerialWork()
  private document: ReminderDocument | null = null
  private syncing: Promise<void> | null = null
  private timer: ReturnType<typeof setInterval> | undefined
  constructor(private readonly options: EmailRemindersOptions) {
    this.path = join(options.atcDir, 'email-reminder.json')
  }
  private now(): number {
    return (this.options.now ?? Date.now)()
  }
  private async load(): Promise<ReminderDocument> {
    this.document ??= parseReminderDocument(await readDocument<unknown>(this.path, null).catch(() => null))
    return this.document
  }
  private async save(document: ReminderDocument): Promise<void> {
    // The file first: a failed write must not show a reminder that the next start forgets.
    await writeDocument(this.path, document)
    this.document = document
  }
  /** What the snapshot shows; nothing until the file was read once. */
  view(): WorkspaceReminder | null {
    return reminderView(this.document?.reminder ?? null)
  }
  start(): void {
    void this.load()
      .then(() => this.sync())
      .catch(() => undefined)
    this.timer ??= setInterval(() => void this.sync().catch(() => undefined), this.options.pollMs ?? POLL_MS)
    this.timer.unref?.()
  }
  stop(): void {
    clearInterval(this.timer)
    this.timer = undefined
  }
  /** Register `email` for the download of `model` (or the latest model download); a success is the service's 204. */
  async request(input: WorkspaceInput): Promise<WorkspaceReminder | null> {
    const email = reminderEmail(input['email'])
    if (!email) throw new AtcError('ATC_USAGE', 'Enter a valid email address.')
    const target = reminderTarget(await this.options.setups(), String(input['model'] ?? ''))
    if (!target)
      throw new AtcError('ATC_USAGE', 'No model is downloading.', {
        hint: 'The reminder is for a model that is still downloading.',
      })
    const modelName = reminderModelName(input['model_name'], target.model)
    await this.serial.run('reminder', async () => {
      const token = (await this.load()).token ?? randomBytes(32).toString('base64url')
      // Stop the earlier reminder before its address changes: an uncertain answer asks for a retry
      // instead of notifying an address the user replaced.
      await this.save({ token, reminder: null })
      await registerReminder(this.options.fetch, token, {
        email,
        // The service writes its email in English whatever the locale; both clients are English.
        locale: 'en',
        model_name: modelName,
        app_version: ATC_VERSION,
        ...(this.options.platform ? { platform: `atc-${this.options.platform}` } : {}),
      }).catch(registrationFailed)
      await this.save({
        token,
        reminder: {
          ...target,
          model_name: modelName,
          status: 'waiting',
          registered_at: this.now(),
          ready: false,
          attempts: 0,
          next_attempt_at: 0,
        },
      })
    })
    void this.sync().catch(() => undefined)
    return this.view()
  }
  /** Tell the service once the download is done; on a timer, after a start and after a registration. */
  sync(): Promise<void> {
    this.syncing ??= this.serial
      .run('reminder', async () => {
        const { token, reminder } = await this.load()
        if (!token || reminder?.status !== 'waiting') return
        if (this.now() - reminder.registered_at >= RETENTION_MS)
          return this.save({ token, reminder: { ...reminder, status: 'expired' } })
        if (!reminder.ready && !reminderModelReady(await this.options.setups(), reminder)) return
        if (this.now() < reminder.next_attempt_at) return
        const attempt = nextAttempt(reminder, this.now())
        // Saved before it is sent: a quit or a lost 202 retries only the notification, which is idempotent.
        await this.save({ token, reminder: attempt })
        let failure: ReminderApiError | null = null
        try {
          await notifyReminder(this.options.fetch, token, attempt.model_name, () => this.now())
        } catch (error) {
          if (!(error instanceof ReminderApiError)) return
          failure = error
        }
        await this.save({ token, reminder: afterNotify(attempt, failure, this.now()) })
      })
      .finally(() => {
        this.syncing = null
      })
    return this.syncing
  }
}

/** What a client shows for a failed registration; the address stays in its form, never in a message. */
function registrationFailed(error: unknown): never {
  if (error instanceof ReminderApiError && (error.status === 400 || error.status === 422))
    throw new AtcError('ATC_USAGE', 'Check the email address and try again.')
  if (error instanceof ReminderApiError && error.status === 429)
    throw new AtcError('ATC_USAGE', 'Too many requests. Try again in an hour.')
  throw new AtcError(
    'ATC_INTERNAL',
    "Could not save the reminder. Check this server's internet connection and try again.",
    error instanceof ReminderApiError ? { details: error.message } : {}
  )
}
