import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import type { WorkspaceState } from '../state.js'
import { modelProvider } from '../../../terminal-setup/index.js'
import { readVision } from './chat-load.js'
import { PAGE_FOCUS } from '../state.js'

const selections = new WeakMap<WorkspaceController, number>()
const saves = new WeakMap<WorkspaceController, Promise<void>>()
export function beginModelSelection(ctx: ActionContext) {
  const revision = (selections.get(ctx.controller) ?? 0) + 1
  selections.set(ctx.controller, revision)
  return () => selections.get(ctx.controller) === revision
}
/** What to save as the endpoint: null for this server, which is saved as no address of its own. */
export const chosenEndpoint = (s: WorkspaceState) => (s.endpointFollowsServer ? null : s.endpoint)
export async function persistModelSelection(
  ctx: ActionContext,
  model: string,
  endpoint: string | null,
  fresh: () => boolean,
  engine?: string
) {
  const previous = saves.get(ctx.controller) ?? Promise.resolve()
  const next = previous
    .catch(() => {})
    .then(async () => {
      if (!fresh()) return
      await ctx.controller.save('tui.model', model)
      if (!fresh()) return
      // A saved address of this server would stay behind when the API moves to another port.
      if (endpoint === null) await ctx.controller.unset('tui.endpoint')
      else await ctx.controller.save('tui.endpoint', endpoint)
      if (engine && fresh()) await ctx.controller.engineSelection.remember(engine)
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
  const provider = picked ?? modelProvider(state.engine, model.provider),
    engine = state.engine.split('|')[0] === provider ? state.engine : provider
  const fresh = selection ?? beginModelSelection(ctx)
  ctx.update((s) => ({
    ...s,
    model: model.id,
    engine,
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
    ctx.update((s) => ({ ...s, endpoint, endpointFollowsServer: true }))
    await ctx.controller.loadModel(provider, model.id)
    if (!fresh()) return
    const modelVision = await readVision(ctx.controller, provider, model.id)
    if (!fresh()) return
    await persistModelSelection(ctx, model.id, null, fresh, engine)
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
  await persistModelSelection(ctx, model, chosenEndpoint(ctx.get()), fresh)
}

/** A validated connection is a new selection, even before it has a model. */
export async function selectEndpoint(endpoint: string, ctx: ActionContext) {
  const fresh = beginModelSelection(ctx)
  ctx.update((s) => ({
    ...s,
    endpoint,
    endpointFollowsServer: false,
    model: '',
    models: [],
    modelVision: null,
    modelLoad: null,
    loadError: null,
    busy: false,
    pickerBusy: false,
    message: '',
  }))
  try {
    await persistModelSelection(ctx, '', endpoint, fresh)
  } catch (error) {
    if (fresh()) throw error
    return false
  }
  if (!fresh()) return false
  ctx.update((s) => ({
    ...s,
    overlay: null,
    focus: s.page === 'chat' ? 'composer' : PAGE_FOCUS[s.page],
    message: 'Connection saved. Choose a model to begin.',
  }))
  return true
}
