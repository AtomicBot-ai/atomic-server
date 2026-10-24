import { workspaceHeaderRows } from '../draw/brand-header.js'
import { drawWaitingSetup, waitingSetupAction } from './waiting-setup.js'
import { FIRST_RUN_STEPS, FIRST_RUN_TITLES } from '../../../contract/index.js'
import type { ActionContext } from '../actions.js'
import type { Canvas } from '../draw/canvas.js'
import { button, text, COLORS } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { drawSetupCloud } from './cloud-step.js'
import { drawSetupMedia, loadSetupMedia, mediaSetupAction } from './media-step.js'
import { cloudAction } from '../library/cloud-actions.js'
import { setupAction } from './setup-actions.js'
import { returnToConnection } from '../server/connection-model-return.js'
import { modelJob } from '../library/model-job.js'
import { quietButton } from '../draw/controls.js'
import { actionButton } from '../draw/cards.js'
import { firstModelChoices, selectedFirstModel } from './first-model.js'
import { pathKind } from './engine-setup.js'
import { record } from '../library/library-model.js'
import { accessPurposeAction, drawSetupPermissions, openFirstRunServer } from './access-purpose.js'
import { drawFirstConnection, firstConnectionAction } from './connection-choice.js'

export async function firstRunAction(id: string, ctx: ActionContext): Promise<boolean> {
  if (await waitingSetupAction(id, ctx)) return true
  if (await accessPurposeAction(id, ctx)) return true
  if (await firstConnectionAction(id, ctx)) return true
  if (await mediaSetupAction(id, ctx)) return true
  const s = ctx.get()
  const patch = (p: Partial<WorkspaceState>) =>
    ctx.update((v) => (s.firstRun && !s.setupComplete && v.setupComplete ? v : { ...v, ...p }))
  if (id.startsWith('first-model-choice:')) {
    const index = Number(id.slice(19)),
      choice = firstModelChoices(s)[index]
    if (choice && s.setup)
      patch({ setup: { ...s.setup, firstChoice: choice.key }, selected: index, focus: id })
    return true
  }
  if (id === 'first-model-continue') {
    const choice = selectedFirstModel(s)
    if (!choice || s.setup?.busy) return true
    if (choice.installed) return firstRunAction(choice.action, ctx)
    patch({ firstRun: 'permissions', page: 'welcome', focus: 'first-permission:notifications' })
    await setupAction(choice.action, ctx)
    const pending = ctx.get().setup,
      model = pending?.selections[0]?.plan.model_id ?? pending?.path?.job?.model
    if (model && (ctx.get().firstRun || pending?.destination)) {
      await ctx.controller.save('tui.model', model)
      ctx.update((v) => ({
        ...v,
        model,
        connection: v.connection && !v.connection.model ? { ...v.connection, model } : v.connection,
      }))
    }
    return true
  }
  if (s.connection?.pickingModel && ['setup-intro', 'first-continue', 'library-close'].includes(id))
    return returnToConnection(ctx)
  if (id === 'hosting' && s.page === 'welcome' && s.firstRun === 'model') id = 'first-model'
  if (id === 'setup-intro' && s.firstRun) id = 'first-model'
  if (id === 'first-model') {
    patch({ firstRun: 'model' })
    const installed = await ctx.controller.installed()
    if (s.firstRun && !ctx.get().firstRun) return true
    patch({ installed })
    await setupAction(s.setupComplete ? 'install-models' : 'hosting', ctx)
    if (ctx.get().setup?.error) return true
    const engine = ctx.get().setup?.engine ?? ''
    await setupAction(pathKind(engine) ? `setup-engine:${engine}` : 'setup-models', ctx)
    if (!ctx.get().firstRun) return true
    patch({ focus: 'first-model-choice:0', selected: 0 })
    void ctx.controller.runtime
      .execute('hardware.info')
      .then((value) => {
        const info = record(record(value)['info']),
          name = String(record(info['cpu'])['name'] ?? info['os_name'] ?? '')
        ctx.update((v) =>
          v.setup && name
            ? { ...v, setup: { ...v.setup, device: { name, memory: Number(info['total_memory']) || 0 } } }
            : v
        )
      })
      .catch(() => {})
    return true
  }
  if (id.startsWith('first-installed:')) {
    const model = s.installed[Number(id.slice(16))]
    if (model && returnToConnection(ctx, { model: model.id, provider: model.provider })) return true
    if (model) {
      await ctx.controller.save('tui.model', model.id)
      patch({
        model: model.id,
        engine: model.provider,
        firstRun: 'permissions',
        page: 'welcome',
        setup: null,
        focus: 'first-next',
      })
    }
    return true
  }
  if (id === 'first-downloads') {
    patch({ page: 'setup', focus: 'first-continue' })
    return true
  }
  if (id === 'first-return') {
    patch({ page: 'welcome', firstRun: 'media', focus: 'first-next' })
    return true
  }
  if (id.startsWith('first-media:')) {
    await loadSetupMedia(ctx)
    return true
  }
  if (id === 'first-skip') {
    await openFirstRunServer(ctx)
    return true
  }
  if (id === 'first-next' || id === 'first-skip-step' || id === 'first-back') {
    const at = FIRST_RUN_STEPS.indexOf(s.firstRun ?? 'model')
    const step =
      FIRST_RUN_STEPS[Math.max(0, Math.min(FIRST_RUN_STEPS.length - 1, at + (id === 'first-back' ? -1 : 1)))]!
    if (step === 'model') return firstRunAction('first-model', ctx)
    patch({
      firstRun: step,
      page: 'welcome',
      overlay: null,
      focus: 'first-next',
    })
    if (step === 'cloud') {
      patch({ focus: 'cloud-choice:0', selected: 0 })
      await cloudAction('cloud-refresh', ctx)
    }
    if (step === 'media') await loadSetupMedia(ctx)
    if (step === 'connect') patch({ focus: 'first-connect:endpoint' })
    return true
  }
  if (id === 'first-continue') {
    patch({
      firstRun: 'permissions',
      page: 'welcome',
      overlay: null,
      selected: 0,
      focus: 'first-permission:notifications',
    })
    return true
  }
  return false
}

export function drawFirstRun(c: Canvas, s: WorkspaceState, focus: string, seconds = 0) {
  if (s.finalSetup) {
    drawWaitingSetup(c, s, focus)
    return
  }
  const width = Math.min(100, c.width - 8),
    x = Math.floor((c.width - width) / 2)
  const headingY = workspaceHeaderRows(c)
  const step = s.firstRun ?? 'model'
  const contentY = headingY + (c.height < 30 ? 1 : 2),
    contentRows = step === 'permissions' ? 13 : step === 'connect' ? 11 : step === 'cloud' ? 22 : 20,
    actionY = Math.min(c.height - 6, contentY + contentRows)
  text(c, x, headingY, FIRST_RUN_TITLES[step], COLORS.gold, width)
  if (step === 'model') {
    text(c, x, contentY, s.message || 'Loading models…', COLORS.muted, width)
    if (s.message) button(c, 'first-model', x, contentY + 2, 'Retry', 'Reload available models', focus)
    button(
      c,
      'first-skip',
      x + width - 13,
      actionY + 1,
      'Skip setup',
      'Open workspace; downloads continue',
      focus
    )
    return
  }
  if (step === 'permissions') drawSetupPermissions(c, x, contentY, width, actionY - 1, focus)
  else if (step === 'cloud') drawSetupCloud(c, s, x, contentY, width, actionY - 1, focus, seconds)
  else if (step === 'media') drawSetupMedia(c, s, x, contentY, width, actionY - 1, focus, seconds)
  else drawFirstConnection(c, x, contentY, width, actionY - 1, focus, seconds)
  const label =
    step === 'permissions'
      ? 'Skip'
      : step === 'cloud'
        ? s.cloud.providers.length
          ? 'Continue'
          : 'Skip'
        : s.libraryRows.some((row) => modelJob(s, row.id))
          ? 'Continue'
          : 'Skip'
  button(c, 'first-back', x, actionY + 1, '< Back', 'Return to the previous choice', focus)
  const nextX = x + width - label.length - 6
  const skipX = step === 'connect' ? x + width - 12 : nextX - 15
  quietButton(c, 'first-skip', skipX, actionY + 1, 'Skip setup', 'Open workspace; downloads continue', focus)
  if (step === 'connect') return
  actionButton(
    c,
    'first-next',
    nextX,
    actionY,
    label,
    step === 'cloud'
      ? 'Continue to image and video models'
      : 'Choose an agent or endpoint; downloads continue',
    focus
  )
}
