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
  if (s.loadError?.model === s.model && !s.modelLoad) return undefined
  const loads = s.workspace?.loads ?? []
  const load = s.modelLoad
    ? loads.find((l) => l.model_id === s.modelLoad?.model && l.provider === s.modelLoad.provider)
    : (loads.find((l) => l.model_id === s.model) ?? [...loads].sort((a, b) => b.at - a.at)[0])
  return load ? { ...load, elapsed_ms: load.elapsed_ms + Math.max(0, now - load.at) } : undefined
}

export function drawLoadLine(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  focus: string,
  seconds = 0
) {
  const load = currentLoad(s)
  if (load || s.modelLoad) {
    const spinner = s.motion ? '|/-\\'[Math.floor(seconds * 6) % 4] : '·'
    const label = `${spinner} ${load ? `${load.model_id !== s.model ? `Loading ${load.model_id}: ` : ''}${loadStageText(load)}` : 'Loading model…'}`
    text(c, x, y, label, COLORS.composerInk, Math.max(0, width - 14), COLORS.composer)
    button(c, 'cancel-load', x + width - 13, y, 'Cancel load', 'Stop this load', focus)
  } else if (s.loadError) {
    const label = `Load failed: ${s.loadError.message}`
    text(c, x, y, label, COLORS.composerError, Math.max(0, width - 17), COLORS.composer)
    button(c, 'retry-load', x + width - 16, y, 'Retry', 'Retry loading this model', focus)
    button(c, 'load-log', x + width - 9, y, 'View log', 'The last attempt’s log', focus)
  }
}

export async function loadAction(id: string, ctx: ActionContext): Promise<boolean> {
  const s = ctx.get()
  if (id === 'retry-load' && s.loadError) {
    const index = s.installed.findIndex((model) => model.id === s.loadError?.model)
    if (index >= 0) {
      const { selectLocalModel } = await import('./model-selection.js')
      await selectLocalModel(`installed:${index}:${s.loadError.provider}`, ctx)
    }
    return true
  }
  if (id === 'cancel-load') {
    const load =
      currentLoad(s) ?? (s.modelLoad ? { provider: s.modelLoad.provider, model_id: s.modelLoad.model } : null)
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
