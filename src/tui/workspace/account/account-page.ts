/** The Account page's content: its open tab, Overview or Remote models. */
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { shownAccount } from './account-model.js'
import { drawAccountOverview } from './account-panel.js'
import { drawRemoteModels } from './remote-devices.js'

export function drawAccountPage(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  // Accounts turned off leave this page (`leaveAccountPage`); until then it has nothing to show.
  const account = shownAccount(s.workspace)
  if (!account) return
  if (s.accountView === 'remote') drawRemoteModels(c, s, account, x, y, width, bottom, focus)
  else drawAccountOverview(c, s, account, x, y, width, bottom, focus)
}
