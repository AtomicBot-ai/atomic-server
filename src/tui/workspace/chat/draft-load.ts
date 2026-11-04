import type { ActionContext } from '../action-types.js'
import type { WorkspaceState } from '../state.js'
import type { WorkspaceController } from '../controller.js'
import { sameEndpoint } from '../../../terminal-service/index.js'
import { chatReadiness } from './readiness.js'
import { beginModelSelection, selectLocalModel } from './model-selection.js'
import { chatNotice } from './recovery.js'

const attempts = new WeakMap<WorkspaceController, symbol>()
export function cancelDraftLoad(controller: WorkspaceController) {
  attempts.delete(controller)
}
export function draftLoadAvailable(s: WorkspaceState) {
  if (!s.installed.some((model) => model.id === s.model)) return false
  const remote =
    !s.endpointFollowsServer && s.endpoint && !sameEndpoint(s.endpoint, s.workspace?.api.endpoint ?? '')
  const readiness = chatReadiness(s)
  return (
    !remote &&
    !s.generating &&
    !s.modelLoad &&
    !readiness?.waiting &&
    !readiness?.ready &&
    readiness?.acquire !== 'server'
  )
}
const draft = (s: WorkspaceState) => JSON.stringify([s.draft, s.images, s.documents, s.conversation?.id])
/** Loading is explicit; a changed draft or selection never becomes an unattended send. */
export async function loadDraftAction(id: string, ctx: ActionContext): Promise<boolean> {
  if (id !== 'load-and-send') return false
  const before = ctx.get()
  if (attempts.has(ctx.controller) || before.busy || !draftLoadAvailable(before)) return true
  const index = before.installed.findIndex((model) => model.id === before.model),
    token = Symbol(),
    original = draft(before),
    selection = beginModelSelection(ctx)
  attempts.set(ctx.controller, token)
  const current = () =>
    attempts.get(ctx.controller) === token &&
    selection() &&
    ctx.get().page === 'chat' &&
    ctx.get().model === before.model &&
    draft(ctx.get()) === original &&
    ctx.get().endpointFollowsServer
  try {
    await selectLocalModel(`installed:${index}`, ctx, selection)
    if (!current() || ctx.get().loadError) return true
    let snapshot = await ctx.controller.runtime.snapshot()
    if (!current()) return true
    if (!snapshot.api.running) {
      ctx.update((s) => ({ ...s, busy: true, message: 'Model loaded. Starting API…' }))
      await ctx.controller.api(true, false)
      snapshot = await ctx.controller.runtime.snapshot()
    }
    if (!current()) return true
    if (!snapshot.api.running) throw new Error('The API did not start. Open Server to inspect its status.')
    ctx.update((s) => ({ ...s, workspace: snapshot, busy: false, chatNotice: undefined }))
    ctx.send()
  } catch (error) {
    if (current()) ctx.update((s) => ({ ...s, chatNotice: chatNotice(String(error)) }))
  } finally {
    if (attempts.get(ctx.controller) === token) {
      attempts.delete(ctx.controller)
      ctx.update((s) => ({ ...s, busy: false }))
    }
  }
  return true
}
