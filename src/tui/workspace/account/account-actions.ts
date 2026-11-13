/** Signing this server in and out from the terminal, and closing an account dialog with what it started. */
import type { AccountSignInStep, WorkspaceAccount } from '../../../contract/index.js'
import { accountLine } from '../../../workspace-view/index.js'
import { oneLine } from '../../controller.js'
import type { ActionContext } from '../action-types.js'
import type { WorkspaceState } from '../state.js'
import { accountUi, isAccountOverlay, shownAccount, withAccount } from './account-model.js'
import type { AccountUi } from './account-model.js'
import { deviceAction } from './device-actions.js'

const execute = (ctx: ActionContext, operation: string, input: Record<string, unknown> = {}) =>
  ctx.controller.runtime.execute(operation, input)

/** A sign-in step the server answered with, kept in the snapshot's account. */
function withSignIn(s: WorkspaceState, sign_in: AccountSignInStep): WorkspaceState {
  const account = shownAccount(s.workspace)
  return account ? withAccount(s, { ...account, sign_in }) : s
}

function setUi(ctx: ActionContext, part: Partial<AccountUi>, patch: Partial<WorkspaceState> = {}) {
  ctx.update((v) => ({ ...v, ...patch, accountUi: { ...accountUi(v, Date.now()), ...part } }))
}

/** Where focus goes back to when a dialog closes. */
const OPENERS: Record<string, string> = {
  'account-email': 'account-email',
  'account-device': 'account-device',
  'account-signout': 'account-signout',
  'account-pairing': 'account-pair',
}

/** Close an account dialog; a sign-in it showed is cancelled and an unused pairing code closed. */
async function closeDialog(ctx: ActionContext): Promise<void> {
  const s = ctx.get(),
    ui = accountUi(s),
    step = shownAccount(s.workspace)?.sign_in.state
  ctx.update((v) => ({
    ...v,
    overlay: null,
    focus: OPENERS[s.overlay ?? ''] ?? `account-revoke:${ui.grant}`,
    hover: '',
    message: '',
    accountUi: { ...ui, code: '', error: '', pairing: null, known: [], grant: '' },
  }))
  const cancel =
    (s.overlay === 'account-device' && step === 'device') ||
    (s.overlay === 'account-email' && step === 'email_sent')
  if (cancel) {
    const account = (await execute(ctx, 'account.signin.cancel')) as WorkspaceAccount
    ctx.update((v) => ({ ...withAccount(v, account), message: 'Sign-in cancelled.' }))
  }
  if (s.overlay === 'account-pairing' && ui.pairing && ui.pairing.expires_at > Date.now()) {
    const account = (await execute(ctx, 'account.remote.pairing.close')) as WorkspaceAccount
    ctx.update((v) => withAccount(v, account))
  }
}

async function emailStep(id: string, ctx: ActionContext): Promise<void> {
  const ui = accountUi(ctx.get())
  ctx.update((v) => ({ ...v, busy: true }))
  try {
    if (id === 'account-email-verify') {
      const account = (await execute(ctx, 'account.signin.email.verify', {
        code: ui.code,
      })) as WorkspaceAccount
      ctx.update((v) => ({
        ...withAccount(v, account),
        overlay: null,
        accountUi: { ...accountUi(v), code: '', error: '' },
        focus: 'server-section:remote',
        hover: '',
        message: `${accountLine(account)}.`,
      }))
    } else {
      const step = (await execute(ctx, 'account.signin.email.start', {
        email: ui.email.trim(),
      })) as AccountSignInStep
      ctx.update((v) => ({
        ...withSignIn(v, step),
        accountUi: { ...accountUi(v), step: 'code', code: '', error: '' },
        focus: 'account-field',
      }))
    }
  } catch (error) {
    // The dialog stays open: the address or the code comes back for another try.
    setUi(ctx, { error: oneLine(error) })
  } finally {
    ctx.update((v) => ({ ...v, busy: false }))
  }
}

/** Show the device sign-in waiting already, or start one; the poll ends it once the server is signed in. */
async function deviceSignIn(id: string, ctx: ActionContext): Promise<void> {
  const waiting = shownAccount(ctx.get().workspace)?.sign_in.state === 'device'
  const open = { overlay: 'account-device' as const, focus: 'account-device-open', hover: '', message: '' }
  if (waiting && id === 'account-device') return setUi(ctx, { error: '', now: Date.now() }, open)
  ctx.update((v) => ({ ...v, busy: true, message: '' }))
  try {
    const step = (await execute(ctx, 'account.signin.device.start')) as AccountSignInStep
    ctx.update((v) => ({
      ...withSignIn(v, step),
      ...open,
      accountUi: { ...accountUi(v), error: '', now: Date.now() },
    }))
  } finally {
    ctx.update((v) => ({ ...v, busy: false }))
  }
}

async function signOut(ctx: ActionContext): Promise<void> {
  ctx.update((v) => ({ ...v, overlay: null, focus: 'account-email', hover: '', busy: true }))
  try {
    const account = (await execute(ctx, 'account.signout')) as WorkspaceAccount
    ctx.update((v) => ({ ...withAccount(v, account), message: 'Signed out.' }))
  } finally {
    ctx.update((v) => ({ ...v, busy: false }))
  }
}

/** Every `account-*` control, and `close` while an account dialog is open. */
export async function accountAction(id: string, ctx: ActionContext): Promise<boolean> {
  const s = ctx.get()
  if (id === 'close' && isAccountOverlay(s.overlay)) {
    await closeDialog(ctx)
    return true
  }
  if (!id.startsWith('account-')) return false
  if (await deviceAction(id, ctx)) return true
  if (id === 'account-field') ctx.update((v) => ({ ...v, focus: id, hover: '' }))
  else if (id === 'account-email' || id === 'account-email-code')
    setUi(
      ctx,
      { step: id === 'account-email' ? 'email' : 'code', code: '', error: '' },
      { overlay: 'account-email', focus: 'account-field', hover: '', message: '' }
    )
  else if (id === 'account-email-back')
    setUi(ctx, { step: 'email', code: '', error: '' }, { focus: 'account-field' })
  else if (id === 'account-email-send' || id === 'account-email-verify') {
    if (!s.busy) await emailStep(id, ctx)
  } else if (id === 'account-device' || id === 'account-device-retry') {
    if (!s.busy) await deviceSignIn(id, ctx)
  } else if (id === 'account-device-open' || id === 'account-device-copy') {
    const step = shownAccount(s.workspace)?.sign_in
    if (step?.state !== 'device') return true
    if (id === 'account-device-copy') await ctx.copy(step.verification_uri_complete)
    else await ctx.controller.run({ name: 'open-url', url: step.verification_uri_complete })
  } else if (id === 'account-signout')
    ctx.update((v) => ({ ...v, overlay: 'account-signout', focus: 'close', hover: '', message: '' }))
  else if (id === 'account-signout-confirm') {
    if (!s.busy) await signOut(ctx)
  } else return false
  return true
}
