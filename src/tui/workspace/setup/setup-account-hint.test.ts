import { expect, it } from 'vitest'
import type { WorkspaceAccount, WorkspaceSnapshot } from '../../../contract/index.js'
import { workspaceFrame } from '../frame.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'

const HINT = 'Share this server with your devices: atc login'
const account = (enabled: boolean, signed_in: boolean) =>
  ({
    enabled,
    signed_in,
    user: signed_in ? { email: 'ann@example.com', display_name: null } : null,
    sign_in: { state: 'idle' },
    remote: { sharing: false, requests: [], devices: [], pairing: null },
  }) as unknown as WorkspaceAccount
const lastStep = (a?: WorkspaceAccount): WorkspaceState => ({
  ...createWorkspace('welcome'),
  firstRun: 'connect',
  focus: 'first-connect:endpoint',
  workspace: {
    keys: [],
    setups: [],
    downloads: [],
    ...(a ? { account: a } : {}),
  } as unknown as WorkspaceSnapshot,
})
const screen = (s: WorkspaceState, width = 100, height = 30) =>
  workspaceFrame(s, width, height, 0)
    .cells.map((row) => row.map((cell) => cell.char).join(''))
    .join('\n')

it.each([
  ['accounts on, nobody signed in', account(true, false), true],
  ['signed in already', account(true, true), false],
  ['accounts off', account(false, false), false],
  ['no account at all', undefined, false],
])('ends setup with how to share the server: %s', (_name, a, shown) => {
  expect(screen(lastStep(a)).includes(HINT)).toBe(shown)
})

it('keeps the hint clear of the connection choices and the Back row on a small terminal', () => {
  const text = screen(lastStep(account(true, false)), 80, 24).split('\n')
  const row = text.findIndex((line) => line.includes(HINT))
  expect(row).toBeGreaterThan(0)
  expect(text[row]!.trim()).toBe(HINT)
  expect(text.findIndex((line) => line.includes('< Back'))).toBeGreaterThan(row)
})
