/** What the account commands share: the snapshot's account, waiting on it, and its lines in the terminal. */
import type { CommandContext } from '../../cli/index.js'
import type { WorkspaceAccount } from '../../contract/index.js'
import {
  ACCOUNT_POLL_MS,
  accountLine,
  deviceLabel,
  formatCheckCode,
  platformLabel,
  sharingLine,
} from '../../workspace-view/index.js'
import { workspace } from '../server/control.js'

/**
 * Account commands stay out of `atc --help` until accounts ship to everyone (`account.enabled` is off by
 * default); they work, and say how to turn accounts on, either way.
 */
export const ACCOUNT_COMMANDS_HIDDEN = true

export async function accountStatus(ctx: CommandContext): Promise<WorkspaceAccount> {
  return (await (await workspace(ctx)).execute('account.status', {})) as WorkspaceAccount
}

export const execute = async (ctx: CommandContext, name: string, input: Record<string, unknown> = {}) =>
  (await workspace(ctx)).execute(name, input)

/** Resolves after `ms`, or at once when the command is interrupted. */
export function pause(ctx: CommandContext, ms = ACCOUNT_POLL_MS): Promise<void> {
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      ctx.signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    ctx.signal.addEventListener('abort', finish, { once: true })
  })
}

/** Poll the account until `done` says so, the command is interrupted, or `deadline` (ms since the epoch) passes. */
export async function waitForAccount(
  ctx: CommandContext,
  done: (account: WorkspaceAccount) => boolean,
  deadline: number
): Promise<WorkspaceAccount | null> {
  while (!ctx.signal.aborted && Date.now() < deadline) {
    await pause(ctx)
    if (ctx.signal.aborted) break
    const account = await accountStatus(ctx)
    if (done(account)) return account
  }
  return null
}

/** The account in the terminal: who, sharing, pending requests and devices. */
export function printAccount(ctx: CommandContext, account: WorkspaceAccount): void {
  ctx.out.line(accountLine(account))
  if (!account.enabled || !account.signed_in) return
  ctx.out.line(sharingLine(account.remote))
  const { requests, devices } = account.remote
  if (requests.length) {
    ctx.out.line()
    ctx.out.line('Asking for access:')
    ctx.out.table(
      [{ header: 'DEVICE' }, { header: 'PLATFORM' }, { header: 'CHECK CODE' }, { header: 'ID' }],
      requests.map((r) => [
        deviceLabel(r),
        platformLabel(r.platform),
        formatCheckCode(r.check_code),
        r.grant_id,
      ])
    )
  }
  if (devices.length) {
    ctx.out.line()
    ctx.out.line('Devices with access:')
    ctx.out.table(
      [{ header: 'DEVICE' }, { header: 'PLATFORM' }, { header: 'SINCE' }, { header: 'ID' }],
      devices.map((d) => [
        deviceLabel(d),
        platformLabel(d.platform),
        d.since ? new Date(d.since).toISOString().slice(0, 10) : '',
        d.grant_id,
      ])
    )
  }
}
