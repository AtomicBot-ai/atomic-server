import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { modelProvider } from '../../../terminal-setup/index.js'
import { readVision } from './chat-load.js'

const selections = new WeakMap<WorkspaceController, number>()
const saves = new WeakMap<WorkspaceController, Promise<void>>()
export function beginModelSelection(ctx: ActionContext) {
  const revision = (selections.get(ctx.controller) ?? 0) + 1
  selections.set(ctx.controller, revision)
  return () => selections.get(ctx.controller) === revision
}
export async function persistModelSelection(
  ctx: ActionContext,
  model: string,
  endpoint: string,
  fresh: () => boolean
) {
  const previous = saves.get(ctx.controller) ?? Promise.resolve()
  const next = previous
    .catch(() => {})
    .then(async () => {
      if (!fresh()) return
      await ctx.controller.save('tui.model', model)
      if (fresh()) await ctx.controller.save('tui.endpoint', endpoint)
    })
  saves.set(ctx.controller, next)
  await next
}

/** Selection is immediate intent; readiness still comes from the server's live sessions. */
export async function selectLocalModel(id: string, ctx: ActionContext, selection?: () => boolean) {
  const state = ctx.get(),
    [index, picked] = id.slice(10).split(':')
  const model = state.installed[Number(index)]
  if (!model) return
  const provider = picked ?? modelProvider(state.engine, model.provider)
  const fresh = selection ?? beginModelSelection(ctx)
  ctx.update((s) => ({
    ...s,
    model: model.id,
    ...(picked ? { engine: state.engine.split('|')[0] === picked ? state.engine : picked } : {}),
    modelVision: null,
    modelLoad: { model: model.id, provider },
    loadError: null,
    page: 'chat',
    overlay: null,
    focus: 'composer',
    hover: '',
    message: '',
    busy: true,
    pickerBusy: false,
  }))
  try {
    const endpoint = await ctx.controller.localEndpoint()
    if (!fresh()) return
    ctx.update((s) => ({ ...s, endpoint }))
    await ctx.controller.loadModel(provider, model.id)
    if (!fresh()) return
    const modelVision = await readVision(ctx.controller, provider, model.id)
    if (!fresh()) return
    await persistModelSelection(ctx, model.id, endpoint, fresh)
    if (fresh()) ctx.update((s) => ({ ...s, modelVision, message: 'Model loaded.' }))
  } catch (error) {
    if (fresh())
      ctx.update((s) => ({
        ...s,
        loadError: {
          provider,
          model: model.id,
          message: error instanceof Error ? error.message : String(error),
        },
        message: '',
      }))
  } finally {
    if (fresh()) ctx.update((s) => ({ ...s, modelLoad: null, busy: false }))
  }
}

export async function selectEndpointModel(model: string, ctx: ActionContext) {
  const fresh = beginModelSelection(ctx)
  ctx.update((s) => ({
    ...s,
    model,
    modelLoad: null,
    loadError: null,
    busy: false,
    pickerBusy: false,
    page: 'chat',
    focus: 'composer',
    overlay: null,
    hover: '',
    message: '',
    selected: 0,
  }))
  await persistModelSelection(ctx, model, ctx.get().endpoint, fresh)
}
