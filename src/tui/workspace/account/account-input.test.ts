import { describe, expect, it } from 'vitest'
import type { Key } from 'ink'
import type { WorkspaceAccount, WorkspaceSnapshot } from '../../../contract/index.js'
import { workspaceFrame } from '../frame.js'
import { workspaceInput } from '../input.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import { accountUi } from './account-model.js'

const account = (over: Partial<WorkspaceAccount> = {}): WorkspaceAccount => ({
  enabled: true,
  signed_in: true,
  user: { email: 'ann@example.com', display_name: null },
  sign_in: { state: 'idle' },
  remote: {
    sharing: true,
    host_name: null,
    tunnel: 'online',
    lan: false,
    addresses: 1,
    pairing: null,
    requests: [],
    devices: [],
    ended: [],
    error: null,
  },
  ...over,
})
const snapshot = (a: WorkspaceAccount) =>
  ({
    api: {
      running: true,
      host: '127.0.0.1',
      port: 1337,
      prefix: '/v1',
      endpoint: 'http://127.0.0.1:1337/v1',
    },
    keys: [],
    setups: [],
    downloads: [],
    account: a,
  }) as unknown as WorkspaceSnapshot
const key = (k: Partial<Key> = {}) => k as Key
function press(s: WorkspaceState, input: string, k: Partial<Key> = {}) {
  return workspaceInput(input, key(k), s, workspaceFrame(s, 100, 30, 0))
}
const remote = (a = account()): WorkspaceState => ({
  ...createWorkspace('account'),
  setupComplete: true,
  accountView: 'remote',
  focus: 'account-section:remote',
  workspace: snapshot(a),
})
const typing = (step: 'email' | 'code', value = ''): WorkspaceState => ({
  ...createWorkspace('account'),
  setupComplete: true,
  overlay: 'account-email',
  focus: 'account-field',
  workspace: snapshot(account({ signed_in: false, user: null })),
  accountUi: { ...accountUi({}), step, [step]: value },
})

describe('Account → Remote models keys', () => {
  it.each([
    ['a', 'account-pair'],
    ['s', 'account-share'],
  ])('%s runs %s while signed in', (input, action) => {
    expect(press(remote(), input).action).toBe(action)
  })

  it.each([
    ['signed out', remote(account({ signed_in: false, user: null }))],
    ['accounts off', remote(account({ enabled: false }))],
    ['a dialog open', { ...remote(), overlay: 'help' as const }],
    [
      'stopping sharing waits for its confirmation',
      { ...remote(), overlay: 'account-stop-sharing' as const },
    ],
    ['on Overview', { ...remote(), accountView: 'overview' as const }],
    [
      'on Server → Remote access',
      { ...remote(), page: 'server' as const, serverView: 'remote', focus: 'remote-toggle' },
    ],
  ])('leaves a and s alone while %s', (_name, s) => {
    expect(press(s, 'a').action).not.toBe('account-pair')
    expect(press(s, 's').action).not.toBe('account-share')
  })

  it('keeps Ctrl+Q quitting', () => {
    expect(press(remote(), 'q', { ctrl: true }).quit).toBe(true)
  })
})

describe('the email sign-in fields', () => {
  it('types the address and sends it with Enter', () => {
    const s = typing('email', 'ann@')
    expect(press(s, 'example.com').patch?.accountUi?.email).toBe('ann@example.com')
    expect(press(s, '', { backspace: true }).patch?.accountUi?.email).toBe('ann')
    expect(press(s, 'u', { ctrl: true }).patch?.accountUi?.email).toBe('')
    expect(press(s, '\r', { return: true }).action).toBe('account-email-send')
  })

  it('keeps only the six digits of a pasted code, and signs in with Enter', () => {
    const s = typing('code')
    expect(press(s, '123 456\r\n').patch?.accountUi?.code).toBe('123456')
    expect(press(typing('code', '12345'), '67').patch?.accountUi?.code).toBe('123456')
    expect(press(s, '\r', { return: true }).action).toBe('account-email-verify')
  })

  it('moves on with Tab and closes with Esc instead of typing', () => {
    const s = typing('email')
    expect(press(s, '\t', { tab: true }).patch?.focus).not.toBe('account-field')
    expect(press(s, '', { escape: true }).action).toBe('close')
  })
})
