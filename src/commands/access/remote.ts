import { AtcError, defineCommand } from '../../cli/index.js'
import type { CommandContext } from '../../cli/index.js'
import { qrTerminal } from '../../account/index.js'
import type { AccountPairingCode, WorkspaceAccount } from '../../contract/index.js'
import { deviceLabel, formatCheckCode, sharingLine } from '../../workspace-view/index.js'
import {
  ACCOUNT_COMMANDS_HIDDEN,
  accountStatus,
  execute,
  printAccount,
  waitForAccount,
} from './account-shared.js'

const digits = (text: string) => text.replace(/\D/g, '')

/** A request by its check code (spaces ignored) or its id. */
function findRequest(account: WorkspaceAccount, wanted: string) {
  const match = account.remote.requests.find(
    (r) => r.grant_id === wanted || (digits(wanted).length === 6 && r.check_code === digits(wanted))
  )
  if (!match)
    throw new AtcError('ATC_USAGE', `No device is asking for access with ${wanted}.`, {
      hint: 'atc remote devices lists the requests and their check codes.',
    })
  return match
}

/** A device with access by its id or its name (any case). */
function findDevice(account: WorkspaceAccount, wanted: string) {
  const name = wanted.trim().toLowerCase()
  const matches = account.remote.devices.filter(
    (d) => d.grant_id === wanted || deviceLabel(d).toLowerCase() === name
  )
  if (matches.length !== 1)
    throw new AtcError(
      'ATC_USAGE',
      matches.length ? `${wanted} names more than one device.` : `No device ${wanted} has access.`,
      { hint: 'atc remote devices lists them with their ids.' }
    )
  return matches[0]!
}

async function decide(ctx: CommandContext, wanted: string, allow: boolean): Promise<number> {
  const request = findRequest(await accountStatus(ctx), wanted)
  if (allow)
    ctx.out.line(
      `Allow ${deviceLabel(request)} only if it shows the check code ${formatCheckCode(request.check_code)}.`
    )
  const account = (await execute(ctx, 'account.remote.decide', {
    grant_id: request.grant_id,
    allow,
  })) as WorkspaceAccount
  ctx.out.result({ schema_version: 1, account }, () =>
    ctx.out.line(allow ? `${deviceLabel(request)} is allowed.` : `${deviceLabel(request)} is denied.`)
  )
  return 0
}

async function addDevice(ctx: CommandContext): Promise<number> {
  const before = await accountStatus(ctx)
  const pairing = (await execute(ctx, 'account.remote.pairing.open')) as AccountPairingCode
  if (ctx.flags.json) {
    ctx.out.json({ schema_version: 1, pairing })
    return 0
  }
  ctx.out.line(`On the device, enter the code ${pairing.code} under remote access, or paste this link:`)
  ctx.out.line()
  ctx.out.line(`  ${pairing.link}`)
  if (ctx.io.isTTY.stdout) {
    ctx.out.line()
    ctx.out.line('A phone can scan it:')
    for (const row of qrTerminal(pairing.link).split('\n')) ctx.out.line(`  ${row}`)
  }
  ctx.out.line()
  ctx.out.line('The code works once, for 10 minutes. Waiting for the device… (Ctrl+C closes the code)')
  const known = new Set(before.remote.devices.map((d) => d.grant_id))
  const account = await waitForAccount(
    ctx,
    (a) => a.remote.devices.some((d) => !known.has(d.grant_id)),
    pairing.expires_at + 5_000
  )
  const added = account?.remote.devices.find((d) => !known.has(d.grant_id))
  if (added) {
    ctx.out.line(`${deviceLabel(added)} can now use this server.`)
    return 0
  }
  await execute(ctx, 'account.remote.pairing.close').catch(() => undefined)
  ctx.out.line(
    ctx.signal.aborted ? 'The code is closed.' : 'The code expired; run atc remote add-device again.'
  )
  return ctx.signal.aborted ? 130 : 1
}

export const remoteCommand = defineCommand({
  name: 'remote',
  summary: 'Share this server with the devices of its Atomic Chat account',
  group: 'access',
  hidden: ACCOUNT_COMMANDS_HIDDEN,
  description:
    'Devices signed in to the same account pair once — with a code, a link, or by asking and being allowed here — and get their own key for this server’s API, and its current address through the tunnel or the local network. Sign in first: atc login.',
  defaultSubcommand: 'devices',
  subcommands: [
    defineCommand({
      name: 'share',
      summary: 'Turn sharing on (starting the API and the tunnel) or off',
      positionals: [{ name: 'state', description: 'on or off', required: true }],
      options: { forget: { type: 'boolean', description: 'With off: revoke every device as well' } },
      examples: ['atc remote share on', 'atc remote share off', 'atc remote share off --forget'],
      run: async (inv, ctx) => {
        const state = inv.positionals[0]
        if (state !== 'on' && state !== 'off') throw new AtcError('ATC_USAGE', 'Use on or off.')
        const forget = state === 'off' && inv.values['forget'] === true
        if (forget && !(await ctx.prompt.confirm('Revoke every device’s access?', { danger: true }))) return 0
        const account = (await execute(ctx, 'account.remote.share', {
          enabled: state === 'on',
          forget,
        })) as WorkspaceAccount
        ctx.out.result({ schema_version: 1, account }, () => ctx.out.line(sharingLine(account.remote)))
        return 0
      },
    }),
    defineCommand({
      name: 'add-device',
      summary: 'Show a pairing code, its link and QR code, and wait for a device',
      run: (_inv, ctx) => addDevice(ctx),
    }),
    defineCommand({
      name: 'devices',
      summary: 'List devices with access and devices asking for it',
      run: async (_inv, ctx) => {
        const account = await accountStatus(ctx)
        ctx.out.result({ schema_version: 1, account }, () => printAccount(ctx, account))
        return 0
      },
    }),
    defineCommand({
      name: 'allow',
      summary: 'Allow a device that asked; compare its check code first',
      positionals: [{ name: 'request', description: 'Check code or id', required: true }],
      run: (inv, ctx) => decide(ctx, inv.positionals[0]!, true),
    }),
    defineCommand({
      name: 'deny',
      summary: 'Deny a device that asked',
      positionals: [{ name: 'request', description: 'Check code or id', required: true }],
      run: (inv, ctx) => decide(ctx, inv.positionals[0]!, false),
    }),
    defineCommand({
      name: 'revoke',
      summary: 'Revoke one device’s access at once',
      positionals: [{ name: 'device', description: 'Device name or id', required: true }],
      run: async (inv, ctx) => {
        const device = findDevice(await accountStatus(ctx), inv.positionals[0]!)
        if (!(await ctx.prompt.confirm(`Revoke ${deviceLabel(device)}?`, { danger: true }))) return 0
        const account = (await execute(ctx, 'account.remote.revoke', {
          grant_id: device.grant_id,
        })) as WorkspaceAccount
        ctx.out.result({ schema_version: 1, account }, () =>
          ctx.out.line(`${deviceLabel(device)} no longer has access.`)
        )
        return 0
      },
    }),
  ],
})
