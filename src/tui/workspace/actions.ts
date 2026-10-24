import { documentAction } from './chat/document-actions.js'
import { selectEndpointModel } from './chat/model-selection.js'
import type { ActionContext } from './action-types.js'
export type { ActionContext } from './action-types.js'
import { chatFeatureAction } from './chat/features.js'
import { featureAction } from './server/feature-actions.js'
import { downloadAction } from './library/download-detail.js'
import { mediaAction } from './media/media-actions.js'
import { waitingGameAction } from './waiting-game.js'
import { settingsDraftAction } from './server/settings-actions.js'
import { remoteAction } from './server/remote-actions.js'
import { cloudAction } from './library/cloud-actions.js'
import { apiAction } from './server/api-actions.js'
import { firstRunAction } from './setup/first-run.js'
import { connectionGuideAction } from './server/connection-guide-actions.js'
import { navigationAction } from './navigation-actions.js'
import { goalSetupAction } from './setup/goal-setup.js'
import { imageAction } from './chat/image-actions.js'
import { libraryAction } from './library/library-actions.js'
import { engineAction } from './library/engine-actions.js'
import { serverEndpoint, example } from './connection.js'
export { serverEndpoint, example } from './connection.js'
import { operationAction } from './operations/operation-actions.js'
import { setupAction } from './setup/setup-actions.js'
import { dataAction, persistConversation, saveDataEdit } from './data-actions.js'
import type { AgentId } from '../../agent-launch/index.js'
import { endpointUrl } from '../../terminal-service/index.js'
import type { WorkspaceState, Page } from './state.js'
import { PAGE_FOCUS } from './state.js'
import { pickerAction } from './chat/picker-actions.js'
import { isPicker } from './chat/picker.js'
export async function activate(id: string, ctx: ActionContext): Promise<void> {
  const { update, controller, get } = ctx,
    s = get()
  const patch = (part: Partial<WorkspaceState>) => update((v) => ({ ...v, ...part }))
  if (await documentAction(id, ctx)) return
  if (await chatFeatureAction(id, ctx)) return
  if (await featureAction(id, ctx)) return
  if (waitingGameAction(id, ctx)) return
  if (await downloadAction(id, ctx)) return
  if (await settingsDraftAction(id, ctx)) return
  if (await remoteAction(id, ctx)) return
  if (await cloudAction(id, ctx)) return
  if (await mediaAction(id, ctx)) return
  if (await firstRunAction(id, ctx)) return
  if (await connectionGuideAction(id, ctx)) return
  if (await goalSetupAction(id, ctx)) return
  if (await navigationAction(id, ctx)) return
  if (await imageAction(id, ctx)) return
  if (await operationAction(id, ctx)) return
  if (await engineAction(id, ctx)) return
  if (await libraryAction(id, ctx)) return
  if (await pickerAction(id, ctx)) return
  if (await setupAction(id, ctx)) return
  if (!s.setupComplete && (id.startsWith('page:') || ['new', 'send', 'api-toggle'].includes(id))) return
  if (await apiAction(id, ctx)) return
  if (await dataAction(id, ctx)) return
  if (id.startsWith('agent:')) {
    if (
      (!s.setupComplete || s.firstRun) &&
      !(s.connection?.step === 'done' && s.connection.agent === id.slice(6))
    ) {
      patch({ message: 'Finish this connection before launching the agent.' })
      return
    }
    if (s.base.daemon.kind !== 'up' || !s.base.daemon.snapshot.server.running) {
      patch({ message: 'Start the API, then open an agent.' })
      return
    }
    patch({ busy: true, message: 'Finding a model for this agent...' })
    try {
      const models = await controller.models(serverEndpoint(s), true)
      if (!models.length) throw new Error('Load a text model in Models before opening an agent.')
      patch({
        agent: id.slice(6) as AgentId,
        agentModel: models.includes(s.model) ? s.model : models[0]!,
        models,
        overlay: 'agent',
        focus: 'launch-agent',
        message: '',
      })
    } finally {
      patch({ busy: false })
    }
    return
  }
  if (id === 'agent-model') {
    const i = s.models.indexOf(s.agentModel)
    patch({ agentModel: s.models[(i + 1) % s.models.length] ?? '' })
    return
  }
  if (id === 'launch-agent') {
    if (!ctx.handoff) throw new Error('Agent handoff is unavailable in this terminal.')
    patch({ busy: true, message: 'Preparing the agent...' })
    try {
      const launch = await controller.prepareAgent(s.agent, serverEndpoint(s), s.agentModel)
      ctx.handoff(launch)
    } finally {
      patch({ busy: false })
    }
    return
  }
  if (id.startsWith('page:')) {
    const page = id.slice(5) as Page
    patch({
      page,
      serverView: 'overview',
      ...(page === 'access' ? { settingsGroup: 'admin' } : {}),
      ...(page === 'settings' ? { settingsGroup: 'tui' } : {}),
      ...(page === 'server' ? { serverView: 'overview' } : {}),
      overlay: null,
      selected: 0,
      scroll: 0,
      focus: PAGE_FOCUS[page],
      hover: '',
      message: '',
    })
    if (page === 'models') return activate('refresh-models', ctx)
    if (page === 'checks' && !s.base.doctor.results) await controller.run({ name: 'doctor' })
    return
  }
  if (id === 'close') {
    if (s.overlay === 'agent' && s.connection) {
      patch({
        overlay: 'connection-guide',
        focus: s.connection.step === 'done' ? 'guide-copy' : 'guide-model',
        hover: '',
        message: '',
      })
      return
    }
    patch({
      overlay: null,
      secret: '',
      focus: isPicker(s.overlay) ? 'composer' : PAGE_FOCUS[s.page],
      hover: '',
      message: '',
    })
    return
  }
  if (id === 'composer') {
    patch({ focus: id })
    return
  }
  if (id === 'new') {
    await persistConversation(ctx)
    ctx.cancel()
    patch({
      page: 'chat',
      chatPreferences: undefined,
      documents: [],
      messages: [],
      images: [],
      conversation: null,
      draft: '',
      cursor: 0,
      focus: 'composer',
      overlay: null,
      scroll: 0,
      message: '',
    })
    return
  }
  if (id === 'motion' || id === 'mouse') {
    const value = !s[id]
    await controller.save(`tui.${id}`, String(value))
    patch({ [id]: value })
    return
  }
  if (id === 'endpoint') {
    patch({ overlay: 'endpoint', edit: 'endpoint', editValue: s.endpoint, focus: 'save-edit', message: '' })
    return
  }
  if (id === 'save-edit') {
    if (await saveDataEdit(ctx)) {
      if (s.edit === 'setup-query') await setupAction('setup-search', ctx)
      return
    }
    const isEndpoint = s.edit === 'endpoint',
      value = isEndpoint ? endpointUrl(s.editValue.trim()) : s.editValue
    await controller.save(isEndpoint ? 'tui.endpoint' : s.edit.slice(8), value)
    patch({
      overlay: null,
      ...(isEndpoint ? { endpoint: value, model: '', models: [] } : {}),
      focus: isEndpoint && s.page === 'chat' ? 'composer' : PAGE_FOCUS[s.page],
      message: isEndpoint
        ? 'Connection saved. Choose a model to begin.'
        : 'Setting saved. Restart the API to apply it.',
    })
    if (isEndpoint) {
      await controller.save('tui.model', '')
      if (get().page === 'models') await activate('refresh-models', ctx)
    }
    await controller.run({ name: 'refresh' })
    return
  }
  if (id === 'refresh-models') {
    patch({ busy: true, message: 'Reading available models...' })
    try {
      const installed = await controller.installed()
      patch({ installed })
      const models = await controller.models(s.endpoint)
      if (get().endpoint === s.endpoint)
        patch({
          models,
          message: models.length
            ? `${models.length} models available.`
            : 'No models are available from this endpoint.',
        })
    } finally {
      patch({ busy: false })
    }
    return
  }
  if (id.startsWith('model:')) {
    const model = s.models[Number(id.slice(6))]
    if (!model) return
    await selectEndpointModel(model, ctx)
    return
  }
  if (id === 'send') {
    ctx.send()
    return
  }
  if (id === 'cancel') {
    ctx.cancel()
    return
  }
  if (id === 'test-request' || id === 'copy-endpoint') {
    const api = s.base.daemon.kind === 'up' ? s.base.daemon.snapshot.server : undefined
    const endpoint = serverEndpoint(s)
    if (id === 'copy-endpoint') {
      ctx.copy(endpoint)
      patch({ message: 'URL sent to the terminal clipboard.' })
      return
    }
    if (!api?.running) {
      patch({ message: 'Start the API before sending a test request.' })
      return
    }
    patch({ endpoint, page: 'models', focus: '', message: '' })
    return activate('refresh-models', ctx)
  }
  if (id === 'examples') {
    patch({ overlay: 'examples', focus: 'copy-example' })
    return
  }
  if (id === 'copy-example') {
    ctx.copy(example(s))
    patch({ message: 'Example sent to the terminal clipboard.' })
    return
  }
  if (id.startsWith('command:')) {
    patch({ selected: Number(id.slice(8)), overlay: 'command', focus: 'close', scroll: 0 })
    return
  }
  if (id.startsWith('request:')) {
    patch({ selected: Number(id.slice(8)), overlay: 'detail', focus: 'close' })
    return
  }
  if (id === 'refresh') {
    await controller.run({ name: 'refresh' })
    patch({ message: 'Status refreshed.' })
    return
  }
  if (id === 'checks') {
    await controller.run({ name: 'doctor' })
    return
  }
  if (id === 'log-filter') {
    update((v) => ({ ...v, base: { ...v.base, logs: { ...v.base.logs, filtering: true } } }))
    return
  }
  if (id === 'log-follow') {
    update((v) => ({
      ...v,
      base: { ...v.base, logs: { ...v.base.logs, follow: !v.base.logs.follow, scroll: 0 } },
    }))
    return
  }
  if (id === 'scroll-up' || id === 'scroll-down')
    update((v) => ({
      ...v,
      scroll: Math.max(0, v.scroll + (id === 'scroll-up' ? 3 : -3)),
      base: {
        ...v.base,
        logs: {
          ...v.base.logs,
          follow: false,
          scroll: Math.max(
            0,
            Math.min(v.base.logs.lines.length - 1, v.base.logs.scroll + (id === 'scroll-up' ? 3 : -3))
          ),
        },
      },
    }))
}
