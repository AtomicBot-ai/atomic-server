/** While a sign-in code or a pairing code is on screen: read the account often and tick its countdown. */
import { useEffect } from 'react'
import type { RefObject } from 'react'
import type { WorkspaceAccount } from '../../../contract/index.js'
import { ACCOUNT_POLL_MS } from '../../../workspace-view/index.js'
import type { WorkspaceController } from '../controller.js'
import { pollEvery } from '../runtime/poll.js'
import type { WorkspaceState } from '../state.js'
import { accountArrived } from './account-model.js'

type Update = (fn: (s: WorkspaceState) => WorkspaceState) => void

export function useAccountPoll(
  overlay: WorkspaceState['overlay'],
  controller: RefObject<WorkspaceController | undefined>,
  update: Update
) {
  const waiting = overlay === 'account-device' || overlay === 'account-pairing'
  useEffect(() => {
    if (!waiting) return
    // A failed read keeps the dialog as it is; the next tick tries again.
    return pollEvery(ACCOUNT_POLL_MS, async (live) => {
      if (!controller.current) return
      const account = (await controller.current.runtime.read('account.status')) as WorkspaceAccount
      if (live()) update((s) => accountArrived(s, account, Date.now()))
    })
  }, [waiting, controller, update])
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(
      () => update((s) => (s.accountUi ? { ...s, accountUi: { ...s.accountUi, now: Date.now() } } : s)),
      1000
    )
    return () => clearInterval(timer)
  }, [waiting, update])
}
