import { AtcError, defineCommand } from '../../cli/index.js'
import type { CommandContext } from '../../cli/index.js'
import { qrTerminal } from '../../account/index.js'
import type { AccountSignInStep, WorkspaceAccount } from '../../contract/index.js'
import { accountLine } from '../../workspace-view/index.js'
import {
  ACCOUNT_COMMANDS_HIDDEN,
  accountStatus,
  execute,
  printAccount,
  waitForAccount,
} from './account-shared.js'

const signedInLine = (account: WorkspaceAccount) => `${accountLine(account)}.`

async function emailSignIn(ctx: CommandContext, email: string | undefined, code: string | undefined) {
  if (email) {
    await execute(ctx, 'account.signin.email.start', { email })
    ctx.out.line(`A sign-in code was sent to ${email}. It is valid for 10 minutes.`)
    if (!code && !(ctx.io.isTTY.stdin && !ctx.flags.json)) {
      ctx.out.result({ schema_version: 1, state: 'email_sent' }, () =>
        ctx.out.line('Finish with: atc login --code <6 digits>')
      )
      return 0
    }
  }
  const digits = code ?? (await ctx.prompt.input('Code from the email'))
  const account = (await execute(ctx, 'account.signin.email.verify', { code: digits })) as WorkspaceAccount
  ctx.out.result({ schema_version: 1, account }, () => ctx.out.line(signedInLine(account)))
  return 0
}

async function deviceSignIn(ctx: CommandContext) {
  const step = (await execute(ctx, 'account.signin.device.start')) as AccountSignInStep
  if (step.state !== 'device') throw new AtcError('ATC_ACCOUNT_UNAVAILABLE', 'The sign-in did not start.')
  // A script gets the code and the link; the server finishes the sign-in by itself once it is approved.
  if (ctx.flags.json) {
    ctx.out.json({ schema_version: 1, sign_in: step })
    return 0
  }
  ctx.out.line('Approve this server from any browser where you can sign in:')
  ctx.out.line()
  ctx.out.line(`  ${step.verification_uri_complete}`)
  ctx.out.line()
  ctx.out.line(`or open ${step.verification_uri} and enter the code ${step.user_code}.`)
  if (ctx.io.isTTY.stdout) {
    ctx.out.line()
    for (const row of qrTerminal(step.verification_uri_complete).split('\n')) ctx.out.line(`  ${row}`)
  }
  ctx.out.line()
  ctx.out.line('Waiting for approval… (Ctrl+C to cancel)')
  const account = await waitForAccount(
    ctx,
    (a) => a.signed_in || a.sign_in.state === 'failed',
    step.expires_at + 5_000
  )
  if (!account) {
    await execute(ctx, 'account.signin.cancel').catch(() => undefined)
    throw new AtcError('ATC_USAGE', ctx.signal.aborted ? 'Sign-in cancelled.' : 'The sign-in code expired.')
  }
  if (account.sign_in.state === 'failed') throw new AtcError('ATC_USAGE', account.sign_in.message)
  ctx.out.line(signedInLine(account))
  return 0
}

export const loginCommand = defineCommand({
  name: 'login',
  summary: 'Sign this server in to an Atomic Chat account',
  group: 'access',
  hidden: ACCOUNT_COMMANDS_HIDDEN,
  description:
    'Without options, shows a code and a link to approve this server from any browser (Google sign-in works there). With --email, sends a one-time code to that address and asks for it. A signed-in server can share its API with the account’s devices: atc remote share on.',
  options: {
    email: { type: 'string', description: 'Send a one-time code to this address instead' },
    code: { type: 'string', description: 'The 6-digit code from the email, for a sign-in already started' },
  },
  examples: ['atc login', 'atc login --email ann@example.com', 'atc login --code 123456'],
  run: async (inv, ctx) => {
    const email = typeof inv.values['email'] === 'string' ? inv.values['email'] : undefined
    const code = typeof inv.values['code'] === 'string' ? inv.values['code'] : undefined
    // Refused with how to turn accounts on, while they are off.
    const current = await accountStatus(ctx)
    if (current.signed_in) {
      ctx.out.result({ schema_version: 1, account: current }, () =>
        ctx.out.line(`${signedInLine(current)} To use another account, run atc logout first.`)
      )
      return 0
    }
    return email || code ? emailSignIn(ctx, email, code) : deviceSignIn(ctx)
  },
})

export const logoutCommand = defineCommand({
  name: 'logout',
  summary: 'Sign this server out of its Atomic Chat account',
  group: 'access',
  hidden: ACCOUNT_COMMANDS_HIDDEN,
  description:
    'Ends this server’s session. Every device that uses this server through the account loses access and must pair again.',
  run: async (_inv, ctx) => {
    const current = await accountStatus(ctx)
    if (current.signed_in) {
      const devices = current.remote.devices.length
      const question = devices
        ? `Sign out? ${devices} device${devices === 1 ? '' : 's'} will lose access to this server.`
        : 'Sign this server out?'
      if (!(await ctx.prompt.confirm(question, { danger: devices > 0 }))) return 0
    }
    const { logout_confirmed: confirmed, ...account } = (await execute(
      ctx,
      'account.signout'
    )) as WorkspaceAccount & {
      logout_confirmed?: boolean
    }
    ctx.out.result({ schema_version: 1, account, logout_confirmed: confirmed === true }, () => {
      ctx.out.line('Signed out.')
      if (current.signed_in && confirmed !== true)
        ctx.out.line(
          'The account service did not confirm it: until it does, remove this server from another device (Account → Remote models).'
        )
    })
    return 0
  },
})

export const accountCommand = defineCommand({
  name: 'account',
  summary: 'Show the Atomic Chat account and the devices that use this server',
  group: 'access',
  hidden: ACCOUNT_COMMANDS_HIDDEN,
  run: async (_inv, ctx) => {
    const account = (await execute(ctx, 'account.status')) as WorkspaceAccount
    ctx.out.result({ schema_version: 1, account }, () => printAccount(ctx, account))
    return 0
  },
})
