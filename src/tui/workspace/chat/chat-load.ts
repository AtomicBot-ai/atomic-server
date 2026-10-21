/**
 * A managed engine's load as the TUI chat shows it (spec managed-models-server, "Этапы загрузки в TUI и
 * admin"): the snapshot's last stage of a load with the model, the time so far and Cancel load;
 * after a failed load, its error and View log (`models.logs`, the last attempt's log).
 */

import { WORKSPACE_OPERATIONS } from '../../../contract/index.js'
import { loadStageText } from '../../../workspace-view/index.js'
import type { ActionContext } from '../actions.js'
import { button, COLORS, text } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'

/**
 * The load in progress of the chat's model, else the newest one (a model loading in its place: the chat
 * switches to it only once it is ready); its elapsed time counted on from when the stage was seen.
 */
export function currentLoad(s: WorkspaceState, now = Date.now()) {
  const loads = s.workspace?.loads ?? []
  const load = loads.find((l) => l.model_id === s.model) ?? [...loads].sort((a, b) => b.at - a.at)[0]
  return load ? { ...load, elapsed_ms: load.elapsed_ms + Math.max(0, now - load.at) } : undefined
}

export function drawLoadLine(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  focus: string
) {
  const load = currentLoad(s)
  if (load) {
    const label = `Loading ${load.model_id} on ${load.provider}: ${loadStageText(load)}`
    text(c, x, y, label, COLORS.gold, Math.max(0, width - 16))
    button(
      c,
      'cancel-load',
      x + Math.min(label.length + 2, width - 14),
      y,
      'Cancel load',
      'Stop this load',
      focus
    )
  } else if (s.loadError) {
    const label = `Load failed: ${s.loadError.message}`
    text(c, x, y, label, COLORS.red, Math.max(0, width - 13))
    button(
      c,
      'load-log',
      x + Math.min(label.length + 2, width - 11),
      y,
      'View log',
      'The last attempt’s log',
      focus
    )
  }
}

export async function loadAction(id: string, ctx: ActionContext): Promise<boolean> {
  const s = ctx.get()
  if (id === 'cancel-load') {
    const load = currentLoad(s)
    if (load)
      await ctx.controller.runtime.execute('models.cancel', {
        provider: load.provider,
        model_id: load.model_id,
      })
    return true
  }
  if (id === 'load-log' && s.loadError) {
    const { provider, model } = s.loadError
    ctx.update((v) => ({
      ...v,
      operations: [...WORKSPACE_OPERATIONS],
      toolGroup: 'models',
      operation: 'models.logs',
      operationInput: JSON.stringify({ provider, model_id: model }),
      operationResult: '',
      page: 'tools',
      operationReturn: v.page === 'server' ? 'server' : 'chat',
      focus: 'operation-run',
      edit: '',
      selected: 0,
      scroll: 0,
    }))
    return true
  }
  return false
}

/** Whether the model loaded with `provider` takes images (`models.info`); `null` when that cannot be read. */
export async function readVision(
  c: ActionContext['controller'],
  provider: string,
  model: string
): Promise<boolean | null> {
  return Promise.resolve()
    .then(() => c.runtime.execute('models.info', { provider, model_id: model }))
    .then((info) =>
      (info as { vision?: unknown }).vision === undefined
        ? null
        : (info as { vision: unknown }).vision === true
    )
    .catch(() => null)
}
