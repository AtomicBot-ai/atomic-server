import { modelProvider } from '../../../terminal-setup/index.js'
import { serverRunning, serverChatModel, serverSelection } from './server-status.js'
import { CONNECTION_AGENTS } from '../../../contract/index.js'
import type { ActionContext } from '../actions.js'
import { connectionGuideAction } from './connection-guide-actions.js'
import { serverChoices } from './server-settings.js'
import { serverAgents } from './server-overview.js'
export async function serverShellAction(id: string, ctx: ActionContext): Promise<boolean> {
  const s = ctx.get(),
    c = ctx.controller
  if (id === 'server-example-language') {
    ctx.update((v) => ({
      ...v,
      overlay: 'operation-choice',
      operationField: 'connection-language',
      operationChoices: ['curl', 'python'],
      focus: `operation-choice:${v.connectionLanguage === 'python' ? 1 : 0}`,
    }))
    return true
  }
  if (id.startsWith('operation-choice:') && s.operationField === 'connection-language') {
    ctx.update((v) => ({
      ...v,
      connectionLanguage: id.endsWith(':1') ? 'python' : 'curl',
      overlay: null,
      operationField: '',
      focus: 'server-example-language',
    }))
    return true
  }
  if (s.page === 'server' && s.serverView === 'connect' && (id === 'scroll-up' || id === 'scroll-down')) {
    ctx.update((v) => ({
      ...v,
      scroll: Math.max(0, v.scroll + (id === 'scroll-up' ? -3 : 3)),
      focus: 'server-connections-scroll',
    }))
    return true
  }
  if (id.startsWith('server-model-page:')) {
    ctx.update((v) => ({
      ...v,
      page: 'server',
      serverView: 'model',
      overlay: null,
      focus: id.endsWith(':engine') ? 'server-engine' : 'server-model',
      scroll: 0,
      selected: 0,
    }))
    return true
  }
  if (id === 'close' && s.overlay === 'server-choice') {
    ctx.update((v) => ({ ...v, overlay: null, serverChoice: null, focus: `server-${s.serverChoice}` }))
    return true
  }
  if (id.startsWith('sidebar-agent:') || id.startsWith('server-agent:')) {
    const agent = id.startsWith('sidebar-agent:')
      ? CONNECTION_AGENTS[Number(id.slice(14))]
      : serverAgents(s)[Number(id.slice(13))]
    if (agent) await connectionGuideAction(`guide-agent:${agent.id}`, ctx)
    return true
  }
  if (id === 'server-endpoint') {
    await connectionGuideAction('guide-open', ctx)
    await connectionGuideAction('guide-path:endpoint', ctx)
    return true
  }
  if (id === 'server-search') {
    ctx.update((v) => ({ ...v, focus: id }))
    return true
  }
  if (id === 'server-activity' || id === 'server-advanced') {
    ctx.update((v) => ({
      ...v,
      ...(id === 'server-activity'
        ? { serverActivity: !v.serverActivity }
        : { serverAdvanced: !v.serverAdvanced }),
    }))
    return true
  }
  if (id === 'server-selection-discard') {
    ctx.update((v) => ({ ...v, serverDraft: null }))
    return true
  }
  if (id === 'server-engine' || id === 'server-model' || id === 'server-host') {
    const serverChoice = id === 'server-engine' ? 'engine' : id === 'server-model' ? 'model' : 'host'
    ctx.update((v) => ({
      ...v,
      page: 'server',
      serverView: serverChoice === 'host' ? 'configuration' : 'model',
      serverChoice,
      overlay: 'server-choice',
      pickerBusy: serverChoice !== 'host',
      pickerError: '',
      focus: 'server-choice:0',
    }))
    if (serverChoice !== 'host')
      try {
        const [engines, installed] = await Promise.all([
          c.engineSelection.list(await c.setup.catalogs()),
          c.installed(),
        ])
        ctx.update((v) => ({ ...v, engines, installed }))
      } catch (error) {
        ctx.update((v) => ({ ...v, pickerError: error instanceof Error ? error.message : String(error) }))
      } finally {
        ctx.update((v) => ({ ...v, pickerBusy: false }))
      }
    return true
  }
  if (id.startsWith('server-choice:')) {
    if (s.pickerBusy) return true
    const choice = serverChoices(s)[Number(id.slice(14))]
    if (!choice) return true
    ctx.update((v) => {
      if (v.serverChoice === 'host')
        return {
          ...v,
          configDraft: { ...v.configDraft, 'api.host': choice.id },
          overlay: null,
          focus: 'server-host',
        }
      const draft = serverSelection(v)
      const engine = v.engines.find((e) => e.id === choice.id)
      const current = v.installed.find((m) => m.id === draft.model)
      return {
        ...v,
        serverDraft:
          v.serverChoice === 'engine'
            ? {
                engine: choice.id,
                model:
                  engine &&
                  current &&
                  ((current.providers ?? [current.provider]).includes(engine.provider) ||
                    modelProvider(engine.id, current.provider) === engine.provider)
                    ? draft.model
                    : '',
              }
            : { ...draft, model: choice.id },
        overlay: null,
        focus: 'server-selection-save',
      }
    })
    return true
  }
  if (id === 'server-selection-save') {
    if (!s.serverDraft || s.busy) return true
    const engine = s.engines.find(
      (e) => e.id === s.serverDraft!.engine || e.provider === s.serverDraft!.engine
    )
    const model = s.installed.find((m) => m.id === s.serverDraft!.model)
    ctx.update((v) => ({ ...v, busy: true, message: 'Applying selection…' }))
    try {
      if (engine && engine.id !== s.engine) {
        if (engine.installed) await c.engineSelection.select(engine)
        else
          await c.runtime.execute('engines.enqueue', {
            engine: engine.provider,
            target: { version: engine.version, variant: engine.backend },
            select: true,
          })
        ctx.update((v) => ({ ...v, engine: engine.id }))
      }
      if (model && (!engine || engine.installed))
        await c.loadModel(engine?.provider ?? model.provider, model.id)
      await c.save('tui.model', model?.id ?? '')
      ctx.update((v) => ({
        ...v,
        engine: engine?.id ?? v.engine,
        model: model?.id ?? '',
        serverDraft: null,
        message: engine && !engine.installed ? 'Engine download queued.' : 'Selection saved.',
      }))
      await c.run({ name: 'refresh' })
    } finally {
      ctx.update((v) => ({ ...v, busy: false }))
    }
    return true
  }
  if (id === 'server-test') {
    if (s.busy) return true
    const model = serverChatModel(s)
    if (!serverRunning(s) || !model) {
      ctx.update((v) => ({ ...v, message: 'Start the server and load a chat model first.' }))
      return true
    }
    ctx.update((v) => ({ ...v, busy: true, message: 'Testing model response…' }))
    try {
      await c.runtime.execute('chat.complete', {
        request: { model, messages: [{ role: 'user', content: 'Reply with OK.' }], max_tokens: 8 },
      })
      ctx.update((v) => ({ ...v, message: 'Model response received.' }))
    } finally {
      ctx.update((v) => ({ ...v, busy: false }))
    }
    return true
  }
  return false
}
