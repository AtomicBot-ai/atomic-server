import { reminderSet } from '../../../workspace-view/index.js'
import type { ActionContext } from '../actions.js'
import type { Canvas } from '../draw/canvas.js'
import { COLORS, text, wrapWords } from '../draw/canvas.js'
import { actionButton } from '../draw/cards.js'
import { fieldControl } from '../draw/controls.js'
import type { WorkspaceState } from '../state.js'

export type EmailStatus = 'idle' | 'invalid' | 'saving' | 'saved' | 'failed'
export interface ReminderForm {
  email: string
  emailStatus: EmailStatus
  emailError: string
}

const HINT =
  'You agree to one email when this model is ready; the address is used only for that. Keep the server running.'
/** What a terminal too short for the whole consent says instead of a cut sentence. */
const SHORT_HINT = 'One email, nothing else.'
const ERROR = '#ffb3a7'

/**
 * The wait screen's model-ready email, while the model downloads. The server registers the address and
 * sends the email itself once the download is done (`setup.reminder`), so the terminal may close; the
 * address stays in this form, the server keeps only a token.
 */
export function drawWaitingReminder(
  c: Canvas,
  s: WorkspaceState,
  form: ReminderForm,
  box: { x: number; y: number; width: number; bottom: number },
  focus: string
) {
  const { x, y, width, bottom } = box,
    saving = form.emailStatus === 'saving'
  text(c, x, y, 'Email me when it is ready', COLORS.text, width)
  fieldControl(c, 'wait-email', x, y + 2, width - 17, form.email || 'Email address', 'Email address', focus)
  actionButton(
    c,
    'wait-save',
    x + width - 15,
    y + 1,
    saving ? 'Saving...' : 'Notify me',
    'Email me when the model is ready',
    focus
  )
  if (saving) c.targets.pop()
  const reminded = form.emailStatus === 'saved' || (!form.email && reminderSet(s.workspace, s.model)),
    status =
      form.emailStatus === 'invalid'
        ? 'Enter a valid email.'
        : form.emailStatus === 'failed'
          ? form.emailError
          : saving
            ? 'Saving your reminder...'
            : reminded
              ? "Reminder set. We'll email you when it is ready."
              : '',
    statusLines = status ? wrapWords(status, width) : [],
    rows = Math.max(0, bottom - (y + 4)),
    hint = wrapWords(HINT, width),
    // A short terminal shows what just happened first, then as much of the consent as fits whole.
    lines = [
      ...statusLines,
      ...(hint.length <= rows - statusLines.length ? hint : wrapWords(SHORT_HINT, width)),
    ].slice(0, rows)
  lines.forEach((line, row) =>
    text(
      c,
      x,
      y + 4 + row,
      line,
      row >= statusLines.length
        ? COLORS.muted
        : ['invalid', 'failed'].includes(form.emailStatus)
          ? ERROR
          : COLORS.accent,
      width
    )
  )
}

/** Register the address with the server; a closed wait screen is never revived by a late answer. */
export async function saveReminder(ctx: ActionContext, form: ReminderForm) {
  const patch = (next: Partial<ReminderForm>) =>
    ctx.update((v) => (v.finalSetup ? { ...v, finalSetup: { ...v.finalSetup, ...next } } : v))
  if (form.emailStatus === 'saving') return
  const email = form.email.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    patch({ emailStatus: 'invalid' })
    ctx.update((v) => ({ ...v, focus: 'wait-email' }))
    return
  }
  patch({ emailStatus: 'saving', emailError: '' })
  const still = () => ctx.get().finalSetup?.emailStatus === 'saving'
  try {
    await ctx.controller.runtime.execute('setup.reminder', { email })
    if (still()) patch({ email: '', emailStatus: 'saved' })
  } catch (error) {
    if (still())
      patch({ emailStatus: 'failed', emailError: error instanceof Error ? error.message : String(error) })
  }
}
