/**
 * Remote access with the account's devices: sharing (stopping it confirmed while devices have access), a
 * pairing code, allowing a device and revoking one.
 */
import type { AccountPairingCode, WorkspaceAccount } from '../../../contract/index.js'
import { deviceLabel } from '../../../workspace-view/index.js'
import type { ActionContext } from '../action-types.js'
import { accountUi, shownAccount, withAccount } from './account-model.js'

const DECISIONS = ['account-allow:', 'account-deny:']
const CONTROLS = ['account-share', 'account-pair', 'account-revoke-confirm', 'account-stop-sharing-confirm']

async function openPairing(ctx: ActionContext, account: WorkspaceAccount): Promise<void> {
  const pairing = (await ctx.controller.runtime.execute('account.remote.pairing.open')) as AccountPairingCode
  ctx.update((v) => ({
    ...v,
    overlay: 'account-pairing',
    focus: 'account-pair-copy',
    hover: '',
    accountUi: {
      ...accountUi(v),
      pairing,
      known: account.remote.devices.map((device) => device.grant_id),
      error: '',
      now: Date.now(),
    },
  }))
}

/** The operation a control runs, and what the status line says once it is done. */
function change(id: string, account: WorkspaceAccount, grant: string) {
  const { sharing, requests, devices } = account.remote
  // A confirmed stop turns sharing off even when another client turned it off meanwhile.
  if (id === 'account-share' || id === 'account-stop-sharing-confirm') {
    const enabled = id === 'account-share' && !sharing
    const off = devices.length
      ? 'Sharing is off. Every device lost access and must pair again once you share again.'
      : 'Sharing is off.'
    return {
      operation: 'account.remote.share',
      input: { enabled },
      done: enabled ? 'Sharing with your devices is on.' : off,
    }
  }
  const allow = id.startsWith('account-allow:')
  const grantId = id === 'account-revoke-confirm' ? grant : id.slice(id.indexOf(':') + 1)
  const device = [...requests, ...devices].find((d) => d.grant_id === grantId)
  const name = device ? deviceLabel(device) : 'The device'
  if (id === 'account-revoke-confirm')
    return {
      operation: 'account.remote.revoke',
      input: { grant_id: grantId },
      done: `${name} no longer has access to this server.`,
    }
  return {
    operation: 'account.remote.decide',
    input: { grant_id: grantId, allow },
    done: allow ? `${name} is allowed to use this server.` : `${name} was denied.`,
  }
}

export async function deviceAction(id: string, ctx: ActionContext): Promise<boolean> {
  const s = ctx.get(),
    ui = accountUi(s),
    account = shownAccount(s.workspace)
  if (id === 'account-pair-copy' || id === 'account-pair-code') {
    if (ui.pairing) await ctx.copy(id === 'account-pair-copy' ? ui.pairing.link : ui.pairing.code)
    return true
  }
  if (id.startsWith('account-revoke:')) {
    ctx.update((v) => ({
      ...v,
      overlay: 'account-revoke',
      focus: 'close',
      hover: '',
      message: '',
      accountUi: { ...accountUi(v), grant: id.slice('account-revoke:'.length) },
    }))
    return true
  }
  const ours = CONTROLS.includes(id) || DECISIONS.some((prefix) => id.startsWith(prefix))
  if (!ours) return false
  if (!account?.signed_in || s.busy) return true
  if (id === 'account-pair' && !account.remote.sharing) {
    ctx.update((v) => ({ ...v, message: 'Turn on sharing with your devices first: press s.' }))
    return true
  }
  // Stopping ends every device's access: with devices, it waits for a confirmation.
  if (id === 'account-share' && account.remote.sharing && account.remote.devices.length) {
    ctx.update((v) => ({ ...v, overlay: 'account-stop-sharing', focus: 'close', hover: '', message: '' }))
    return true
  }
  const confirmed = id === 'account-revoke-confirm' || id === 'account-stop-sharing-confirm'
  ctx.update((v) => ({
    ...v,
    busy: true,
    message: '',
    ...(confirmed ? { overlay: null, focus: 'account-share', hover: '' } : {}),
  }))
  try {
    if (id === 'account-pair') await openPairing(ctx, account)
    else {
      const { operation, input, done } = change(id, account, ui.grant)
      const next = (await ctx.controller.runtime.execute(operation, input)) as WorkspaceAccount
      ctx.update((v) => ({ ...withAccount(v, next), message: done }))
    }
  } finally {
    ctx.update((v) => ({ ...v, busy: false }))
  }
  return true
}
