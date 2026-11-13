import { render, Text } from 'ink'
import { act } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { fakeTerminal } from '../../../../test/helpers/fake-terminal.js'
import type { WorkspaceAccount, WorkspaceSnapshot } from '../../../contract/index.js'
import { ACCOUNT_POLL_MS } from '../../../workspace-view/index.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import { accountUi } from './account-model.js'
import { useAccountPoll } from './account-poll.js'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  vi.useRealTimers()
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})

const account = (over: Partial<WorkspaceAccount> = {}): WorkspaceAccount => ({
  enabled: true,
  signed_in: false,
  user: null,
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
    error: null,
  },
  ...over,
})

async function mount(state: WorkspaceState, read: ReturnType<typeof vi.fn>) {
  vi.useFakeTimers()
  const latest = { current: state }
  const controller = { current: { runtime: { read } } as unknown as WorkspaceController }
  const update = (fn: (s: WorkspaceState) => WorkspaceState) => {
    latest.current = fn(latest.current)
  }
  function Probe({ overlay }: { overlay: WorkspaceState['overlay'] }) {
    useAccountPoll(overlay, controller, update)
    return <Text>Account</Text>
  }
  const terminal = fakeTerminal()
  let ui!: ReturnType<typeof render>
  await act(async () => {
    ui = render(<Probe overlay={state.overlay} />, { ...terminal.streams, patchConsole: false })
  })
  cleanup.push(async () => {
    await act(async () => ui.unmount())
    await ui.waitUntilExit()
  })
  return {
    latest,
    rerender: (overlay: WorkspaceState['overlay']) => ui.rerender(<Probe overlay={overlay} />),
  }
}

const opened = (overlay: WorkspaceState['overlay'], a: WorkspaceAccount): WorkspaceState => ({
  ...createWorkspace('access'),
  overlay,
  workspace: { keys: [], account: a } as unknown as WorkspaceSnapshot,
  accountUi: accountUi({}),
})

it('reads the account while a sign-in code is on screen and closes it once the server is signed in', async () => {
  const signedIn = account({ signed_in: true, user: { email: 'ann@example.com', display_name: null } })
  const read = vi.fn().mockResolvedValueOnce(account()).mockResolvedValue(signedIn)
  const { latest } = await mount(opened('account-device', account()), read)
  await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_POLL_MS))
  expect(read).toHaveBeenCalledWith('account.status')
  expect(latest.current.overlay).toBe('account-device')
  await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_POLL_MS))
  expect(latest.current).toMatchObject({ overlay: null, message: 'Signed in as ann@example.com.' })
})

it('ticks the countdown every second while a code is on screen', async () => {
  const { latest } = await mount(opened('account-pairing', account()), vi.fn().mockResolvedValue(account()))
  vi.setSystemTime(10_000)
  await act(async () => vi.advanceTimersByTimeAsync(1000))
  expect(latest.current.accountUi?.now).toBe(11_000)
})

it('reads nothing while no code is on screen', async () => {
  const read = vi.fn().mockResolvedValue(account())
  const { rerender } = await mount(opened(null, account()), read)
  await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_POLL_MS * 3))
  expect(read).not.toHaveBeenCalled()
  await act(async () => rerender('account-pairing'))
  await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_POLL_MS))
  expect(read).toHaveBeenCalledTimes(1)
  await act(async () => rerender(null))
  await act(async () => vi.advanceTimersByTimeAsync(ACCOUNT_POLL_MS * 3))
  expect(read).toHaveBeenCalledTimes(1)
})
