import { setupModelPending } from '../../../workspace-view/index.js'
import { finalSetupState } from './waiting-setup.js'
import type { ActionContext } from '../actions.js'
import type { Canvas } from '../draw/canvas.js'
import { drawConnectionChoices } from '../server/connection-art.js'

/** Desktop onboarding hands off to the owning page; its connection wizard stays optional. */
export async function firstConnectionAction(id: string, ctx: ActionContext): Promise<boolean> {
  const leavingWait = id === 'wait-continue'
  if (leavingWait && ctx.get().finalSetup) {
    id = `first-connect:${ctx.get().finalSetup!.destination}`
  }
  if (id !== 'first-connect:endpoint' && id !== 'first-connect:agent') return false
  if (!leavingWait && setupModelPending(ctx.get().workspace, ctx.get().model)) {
    ctx.update((s) => ({
      ...s,
      finalSetup: finalSetupState(id === 'first-connect:endpoint' ? 'endpoint' : 'agent'),
      focus: 'wait-cell:0',
    }))
    return true
  }
  await ctx.controller.runtime.execute('setup.manual')
  const endpoint = id === 'first-connect:endpoint'
  ctx.update((s) => ({
    ...s,
    setupComplete: true,
    firstRun: null,
    finalSetup: null,
    setup:
      s.setup?.preparing || s.setup?.selections.length || s.setup?.path?.job
        ? { ...s.setup, destination: 'server' }
        : null,
    connection: null,
    overlay: null,
    page: 'server',
    serverView: endpoint ? 'configuration' : 'overview',
    focus: endpoint ? 'server-host' : 'server-search',
    message: '',
    selected: 0,
    scroll: 0,
  }))
  return true
}

export function drawFirstConnection(
  c: Canvas,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string,
  seconds: number
) {
  drawConnectionChoices(c, x, y, width, bottom, focus, seconds, true)
}
