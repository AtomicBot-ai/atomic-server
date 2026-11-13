import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceAccount, WorkspaceSnapshot } from '../../../contract/index.js'
import { activate } from '../actions.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'

const account = (remote: Partial<WorkspaceAccount['remote']> = {}): WorkspaceAccount => ({
  enabled: true,
  signed_in: true,
  user: { email: 'ann@example.com', display_name: 'Ann' },
  sign_in: { state: 'idle' },
  remote: {
    sharing: true,
    host_name: 'studio',
    tunnel: 'online',
    lan: false,
    addresses: 1,
    pairing: null,
    requests: [
      {
        grant_id: 'r1',
        device_name: 'Work MacBook',
        platform: 'macos',
        client_type: 'desktop',
        check_code: '123456',
        created_at: '',
      },
    ],
    devices: [{ grant_id: 'd1', device_name: 'Home PC', platform: 'windows', since: 1 }],
    error: null,
    ...remote,
  },
})
const pairing = {
  code: 'BCDF-GHJK',
  link: 'atomic-chat://remote/pair?c=BCDF-GHJK&k=secret',
  expires_at: Date.now() + 600_000,
  qr_svg: '<svg/>',
}

function fixture(a: WorkspaceAccount) {
  let state: WorkspaceState = {
    ...createWorkspace('server'),
    setupComplete: true,
    serverView: 'remote',
    workspace: { keys: [], account: a } as unknown as WorkspaceSnapshot,
  }
  const execute = vi.fn(async (name: string, _input?: Record<string, unknown>) =>
    name === 'account.remote.pairing.open' ? pairing : account({ sharing: false })
  )
  const copy = vi.fn()
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    copy,
    send: vi.fn(),
    cancel: vi.fn(),
    controller: { runtime: { execute } } as unknown as WorkspaceController,
  }
  return { ctx, execute, copy, get: () => state }
}

describe('sharing with the account’s devices', () => {
  it.each([
    [true, false, 'Sharing is off.'],
    [false, true, 'Sharing with your devices is on.'],
  ])('toggles sharing that is %s', async (sharing, enabled, message) => {
    const t = fixture(account({ sharing }))
    await activate('account-share', t.ctx)
    expect(t.execute).toHaveBeenCalledExactlyOnceWith('account.remote.share', { enabled })
    expect(t.get().message).toContain(message)
    expect(t.get().busy).toBe(false)
  })

  it('does nothing for a server that is not signed in', async () => {
    const t = fixture({ ...account(), signed_in: false, user: null })
    for (const id of ['account-share', 'account-pair', 'account-allow:r1']) await activate(id, t.ctx)
    expect(t.execute).not.toHaveBeenCalled()
  })
})

describe('adding a device', () => {
  it('opens a code, remembers who had access, copies the link or the code', async () => {
    const t = fixture(account())
    await activate('account-pair', t.ctx)
    expect(t.execute).toHaveBeenCalledExactlyOnceWith('account.remote.pairing.open')
    expect(t.get()).toMatchObject({
      overlay: 'account-pairing',
      focus: 'account-pair-copy',
      accountUi: { pairing, known: ['d1'] },
    })
    await activate('account-pair-copy', t.ctx)
    await activate('account-pair-code', t.ctx)
    expect(t.copy.mock.calls).toEqual([[pairing.link], ['BCDF-GHJK']])
  })

  it('closes an unused code with the dialog', async () => {
    const t = fixture(account())
    await activate('account-pair', t.ctx)
    await activate('close', t.ctx)
    expect(t.execute).toHaveBeenLastCalledWith('account.remote.pairing.close', {})
    expect(t.get()).toMatchObject({ overlay: null, focus: 'account-pair', accountUi: { pairing: null } })
  })

  it('leaves an expired code alone', async () => {
    const t = fixture(account())
    await activate('account-pair', t.ctx)
    t.ctx.update((s) => ({
      ...s,
      accountUi: { ...s.accountUi!, pairing: { ...pairing, expires_at: Date.now() - 1 } },
    }))
    await activate('close', t.ctx)
    expect(t.execute).toHaveBeenCalledTimes(1)
  })

  it('asks to share first while sharing is off', async () => {
    const t = fixture(account({ sharing: false }))
    await activate('account-pair', t.ctx)
    expect(t.execute).not.toHaveBeenCalled()
    expect(t.get().message).toBe('Turn on sharing with your devices first: press s.')
  })
})

describe('devices asking for access and devices with it', () => {
  it.each([
    ['account-allow:r1', true, 'Work MacBook is allowed to use this server.'],
    ['account-deny:r1', false, 'Work MacBook was denied.'],
  ])('%s', async (id, allow, message) => {
    const t = fixture(account())
    await activate(id, t.ctx)
    expect(t.execute).toHaveBeenCalledExactlyOnceWith('account.remote.decide', { grant_id: 'r1', allow })
    expect(t.get().message).toBe(message)
  })

  it('revokes a device only after its confirmation', async () => {
    const t = fixture(account())
    await activate('account-revoke:d1', t.ctx)
    expect(t.get()).toMatchObject({ overlay: 'account-revoke', focus: 'close', accountUi: { grant: 'd1' } })
    expect(t.execute).not.toHaveBeenCalled()
    await activate('close', t.ctx)
    expect(t.get()).toMatchObject({ overlay: null, focus: 'account-revoke:d1' })
    expect(t.execute).not.toHaveBeenCalled()
    await activate('account-revoke:d1', t.ctx)
    await activate('account-revoke-confirm', t.ctx)
    expect(t.execute).toHaveBeenCalledExactlyOnceWith('account.remote.revoke', { grant_id: 'd1' })
    expect(t.get()).toMatchObject({
      overlay: null,
      busy: false,
      message: 'Home PC no longer has access to this server.',
    })
  })
})
