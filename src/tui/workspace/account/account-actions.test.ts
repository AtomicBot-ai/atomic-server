import { describe, expect, it, vi } from 'vitest'
import type { AccountSignInStep, WorkspaceAccount, WorkspaceSnapshot } from '../../../contract/index.js'
import { AtcError } from '../../../errors/index.js'
import { activate } from '../actions.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'

const signedOut: WorkspaceAccount = {
  enabled: true,
  signed_in: false,
  user: null,
  sign_in: { state: 'idle' },
  remote: {
    sharing: false,
    host_name: null,
    tunnel: 'off',
    lan: false,
    addresses: 0,
    pairing: null,
    requests: [],
    devices: [{ grant_id: 'g1', device_name: 'Home PC', platform: 'windows', since: 1 }],
    ended: [],
    error: null,
  },
}
const signedIn: WorkspaceAccount = {
  ...signedOut,
  signed_in: true,
  user: { email: 'ann@example.com', display_name: null },
}
const device: AccountSignInStep = {
  state: 'device',
  user_code: 'WXYZ-1234',
  verification_uri: 'https://atomic.chat/activate',
  verification_uri_complete: 'https://atomic.chat/activate?code=WXYZ-1234',
  expires_at: 9e9,
}

function fixture(account: WorkspaceAccount, answers: Record<string, unknown> = {}) {
  let state: WorkspaceState = {
    ...createWorkspace('account'),
    setupComplete: true,
    workspace: { keys: [], account } as unknown as WorkspaceSnapshot,
  }
  const execute = vi.fn(async (name: string, _input?: Record<string, unknown>) => {
    const answer = answers[name]
    if (answer instanceof Error) throw answer
    return answer ?? signedOut
  })
  const run = vi.fn(),
    copy = vi.fn()
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    copy,
    send: vi.fn(),
    cancel: vi.fn(),
    controller: { runtime: { execute }, run } as unknown as WorkspaceController,
  }
  return { ctx, execute, run, copy, get: () => state }
}

describe('signing in with an emailed code', () => {
  it('sends the code, then signs in with it and closes the dialog', async () => {
    const t = fixture(signedOut, {
      'account.signin.email.start': { state: 'email_sent', expires_at: 9e9, resend_at: 9e9 },
      'account.signin.email.verify': signedIn,
    })
    await activate('account-email', t.ctx)
    expect(t.get()).toMatchObject({ overlay: 'account-email', focus: 'account-field' })
    t.ctx.update((s) => ({ ...s, accountUi: { ...s.accountUi!, email: ' ann@example.com ' } }))
    await activate('account-email-send', t.ctx)
    expect(t.execute).toHaveBeenLastCalledWith('account.signin.email.start', { email: 'ann@example.com' })
    expect(t.get()).toMatchObject({ overlay: 'account-email', accountUi: { step: 'code' }, busy: false })
    expect(t.get().workspace?.account?.sign_in.state).toBe('email_sent')
    t.ctx.update((s) => ({ ...s, accountUi: { ...s.accountUi!, code: '123456' } }))
    await activate('account-email-verify', t.ctx)
    expect(t.execute).toHaveBeenLastCalledWith('account.signin.email.verify', { code: '123456' })
    expect(t.get()).toMatchObject({
      page: 'account',
      accountView: 'overview',
      focus: 'account-section:remote',
      overlay: null,
      message: 'Signed in as ann@example.com.',
      busy: false,
    })
    expect(t.get().workspace?.account?.signed_in).toBe(true)
  })

  it('stays on Remote models when it was signed in from there, on the share switch', async () => {
    const t = fixture(signedOut, { 'account.signin.email.verify': signedIn })
    t.ctx.update((s) => ({ ...s, accountView: 'remote' }))
    await activate('account-email-code', t.ctx)
    await activate('account-email-verify', t.ctx)
    expect(t.get()).toMatchObject({ page: 'account', accountView: 'remote', focus: 'account-share' })
  })

  it('keeps a refused code in the dialog with the reason', async () => {
    const t = fixture(signedOut, {
      'account.signin.email.verify': new AtcError('ATC_USAGE', 'Wrong code; 4 attempts left.'),
    })
    await activate('account-email-code', t.ctx)
    await activate('account-email-verify', t.ctx)
    expect(t.get()).toMatchObject({
      overlay: 'account-email',
      busy: false,
      accountUi: { step: 'code', error: 'Wrong code; 4 attempts left.' },
    })
  })

  it('cancels a sent code when the dialog closes, and only then', async () => {
    const t = fixture(signedOut)
    await activate('account-email', t.ctx)
    await activate('close', t.ctx)
    expect(t.execute).not.toHaveBeenCalled()
    expect(t.get()).toMatchObject({ overlay: null, focus: 'account-email' })
    t.ctx.update((s) => ({
      ...s,
      workspace: {
        ...s.workspace!,
        account: { ...signedOut, sign_in: { state: 'email_sent', expires_at: 1, resend_at: 1 } },
      },
    }))
    await activate('account-email-code', t.ctx)
    await activate('close', t.ctx)
    expect(t.execute).toHaveBeenCalledExactlyOnceWith('account.signin.cancel', {})
    expect(t.get().message).toBe('Sign-in cancelled.')
  })
})

describe('signing in on another device', () => {
  it('shows the code and the link, opens or copies the link, and Esc cancels the sign-in', async () => {
    const t = fixture(signedOut, { 'account.signin.device.start': device })
    await activate('account-device', t.ctx)
    expect(t.execute).toHaveBeenCalledWith('account.signin.device.start', {})
    expect(t.get()).toMatchObject({ overlay: 'account-device', busy: false })
    expect(t.get().workspace?.account?.sign_in).toEqual(device)
    await activate('account-device-open', t.ctx)
    expect(t.run).toHaveBeenCalledWith({ name: 'open-url', url: device.verification_uri_complete })
    await activate('account-device-copy', t.ctx)
    expect(t.copy).toHaveBeenCalledWith(device.verification_uri_complete)
    await activate('close', t.ctx)
    expect(t.execute).toHaveBeenLastCalledWith('account.signin.cancel', {})
    expect(t.get()).toMatchObject({ overlay: null, focus: 'account-device', message: 'Sign-in cancelled.' })
  })

  it('shows a sign-in already waiting instead of starting another', async () => {
    const t = fixture({ ...signedOut, sign_in: device })
    await activate('account-device', t.ctx)
    expect(t.execute).not.toHaveBeenCalled()
    expect(t.get().overlay).toBe('account-device')
  })
})

describe('signing out', () => {
  it('asks first, then signs out', async () => {
    const t = fixture(signedIn)
    await activate('account-signout', t.ctx)
    expect(t.get()).toMatchObject({ overlay: 'account-signout', focus: 'close' })
    expect(t.execute).not.toHaveBeenCalled()
    await activate('account-signout-confirm', t.ctx)
    expect(t.execute).toHaveBeenCalledExactlyOnceWith('account.signout', {})
    expect(t.get()).toMatchObject({
      page: 'account',
      accountView: 'overview',
      focus: 'account-email',
      overlay: null,
      message: 'Signed out.',
      busy: false,
    })
    expect(t.get().workspace?.account?.signed_in).toBe(false)
  })

  it('keeps everything as it was when the confirmation is closed', async () => {
    const t = fixture(signedIn)
    await activate('account-signout', t.ctx)
    await activate('close', t.ctx)
    expect(t.execute).not.toHaveBeenCalled()
    expect(t.get()).toMatchObject({ overlay: null, focus: 'account-signout' })
  })
})
