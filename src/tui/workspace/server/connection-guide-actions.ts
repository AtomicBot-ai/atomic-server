import type { ConnectionDraft } from '../../../contract/index.js'
import { CONNECTION_AGENTS, PROFILE_AGENTS } from '../../../contract/index.js'
import type { ActionContext } from '../actions.js'
import { workspaceLocation } from '../navigation-return.js'
import { record } from '../library/library-model.js'
import { setupAction } from '../setup/setup-actions.js'
import { connectionPickerAction } from './connection-picker.js'
import {
  connectionDownload,
  connectionDownloadTarget,
  connectionModelState,
} from '../../../workspace-view/index.js'
const rows = (value: unknown) =>
  Array.isArray(value)
    ? value.map(record)
    : Array.isArray(record(value)['rows'])
      ? (record(value)['rows'] as unknown[]).map(record)
      : []
export async function connectionGuideAction(id: string, ctx: ActionContext): Promise<boolean> {
  if (connectionPickerAction(id, ctx)) return true
  const s = ctx.get(),
    c = ctx.controller
  const patch = (p: Partial<ConnectionDraft>) =>
    ctx.update((v) => ({
      ...v,
      connection: v.connection ? { ...v.connection, ...p } : null,
      focus: 'guide-next',
      hover: '',
    }))
  if (id === 'guide-manual') {
    await connectionGuideAction('guide-close', ctx)
    ctx.update((v) => ({ ...v, serverView: 'overview', focus: 'api-toggle' }))
    return true
  }
  if (id === 'guide-open' || id.startsWith('guide-agent:')) {
    const installed = await c.installed()
    if (s.firstRun && ctx.get().firstRun !== s.firstRun) return true
    const download = connectionDownloadTarget(connectionDownload(s.workspace?.setups ?? []))
    const preferred =
      s.setup?.selections[0]?.plan.model_id ?? s.setup?.path?.job?.model ?? (s.model || download.model)
    const chosen = preferred ? installed.find((m) => m.id === preferred) : installed[0]
    const selected = connectionModelState(
      preferred || chosen?.id || '',
      installed,
      s.workspace?.setups ?? [],
      s.workspace?.downloads ?? [],
      s.setup?.selections[0]?.plan.provider ?? s.setup?.path?.job?.engine ?? download.provider
    )
    const agent = id.startsWith('guide-agent:') ? id.slice(12) : ''
    ctx.update((v) => ({
      ...v,
      installed,
      connectionReturn: s.firstRun ? undefined : (s.connectionReturn ?? workspaceLocation(s)),
      overlay: 'connection-guide',
      focus: agent ? 'guide-configure' : 'guide-path:agent',
      connection: {
        step: agent ? 'review' : 'choose',
        path: 'agent',
        agent: agent || 'claude',
        model: chosen?.id ?? preferred ?? '',
        provider: selected.provider,
        port: String(v.workspace?.api.port || 1337),
        more: false,
        agentPage: 0,
        status: '',
        error: '',
        command: '',
        endpoint: '',
        keyId: '',
      },
    }))
    return true
  }
  const d = s.connection
  if (!d) return false
  if (id === 'save-edit' && s.edit === 'guide-port') {
    patch({ port: s.editValue })
    ctx.update((v) => ({ ...v, overlay: 'connection-guide', edit: '' }))
    return true
  }
  if (!id.startsWith('guide-')) return false
  if (d.step === 'preparing') return true
  if (id === 'guide-models') {
    patch({ pickingModel: true })
    await setupAction('setup-browse', ctx)
    if (!ctx.get().setup?.error) await setupAction('setup-models', ctx)
  } else if (id === 'guide-model-back') await setupAction('setup-picker-close', ctx)
  else if (id === 'guide-more') {
    patch({ more: !d.more, agentPage: 0 })
    ctx.update((v) => ({ ...v, focus: 'guide-more' }))
  } else if (id.startsWith('guide-path:')) {
    const path = id.endsWith('agent') ? 'agent' : 'endpoint'
    patch({ path, step: path })
    ctx.update((v) => ({ ...v, focus: path === 'agent' ? 'guide-select:claude' : 'guide-port' }))
  } else if (id.startsWith('guide-select:')) {
    patch({ agent: id.slice(13), path: 'agent', step: 'review' })
    ctx.update((v) => ({ ...v, focus: 'guide-model' }))
  } else if (id === 'guide-next') patch({ step: 'review' })
  else if (id === 'guide-back') {
    patch({ step: d.step === 'review' ? d.path : 'choose', error: '' })
    ctx.update((v) => ({
      ...v,
      focus:
        d.step === 'review'
          ? d.path === 'agent'
            ? `guide-select:${d.agent}`
            : 'guide-port'
          : `guide-path:${d.path}`,
    }))
  } else if (id === 'guide-port')
    ctx.update((v) => ({
      ...v,
      overlay: 'endpoint',
      edit: 'guide-port',
      editValue: d.port,
      focus: 'save-edit',
    }))
  else if (id === 'guide-close') {
    if (s.firstRun && d.step !== 'done') await c.runtime.execute('setup.manual')
    ctx.update((v) => ({
      ...v,
      firstRun: null,
      setupComplete: true,
      setup: null,
      connection: null,
      overlay: null,
      page: 'server',
      serverView: 'connect',
      focus: 'guide-open',
      ...(!s.firstRun ? s.connectionReturn : {}),
      connectionReturn: undefined,
    }))
  } else if (id === 'guide-copy') ctx.copy(d.command || d.endpoint)
  else if (id === 'guide-key') {
    const key = await c.runtime.execute('keys.reveal', { id: d.keyId })
    ctx.copy(typeof key === 'string' ? key : String(record(key)['token'] ?? record(key)['key'] ?? ''))
  } else if (id === 'guide-configure') {
    const selected = connectionModelState(
      d.model,
      s.installed,
      s.workspace?.setups ?? [],
      s.workspace?.downloads ?? [],
      d.provider
    )
    if (!selected.ready) {
      patch({ error: selected.status })
      return true
    }
    if (!selected.provider || !/^\d+$/.test(d.port) || Number(d.port) < 1 || Number(d.port) > 65535) {
      patch({ error: 'Choose a downloaded model and a port from 1 to 65535.' })
      return true
    }
    patch({ step: 'preparing', error: '', status: 'Loading model' })
    try {
      const execute = (name: string, input: Record<string, unknown> = {}) => c.runtime.execute(name, input)
      await execute('models.load', { provider: selected.provider, model_id: d.model })
      patch({ status: 'Preparing API key' })
      let keys = rows(await execute('keys.list'))
      if (!keys.length) {
        await execute('keys.create', { name: d.path === 'agent' ? d.agent : 'Local endpoint' })
        keys = rows(await execute('keys.list'))
      }
      const keyId = String(keys[0]?.['id'] ?? '')
      if (!keyId) throw new Error('Create an API key and retry.')
      patch({ keyId, status: 'Starting server' })
      await execute('config.update', { values: { 'api.host': '127.0.0.1', 'api.port': Number(d.port) } })
      await execute(s.workspace?.api.running ? 'api.restart' : 'api.start', {
        request: { host: '127.0.0.1', port: Number(d.port) },
      })
      patch({ status: 'Testing model response' })
      await execute('setup.complete', { model_id: d.model })
      const info = record(await execute('connection.info'))
      let command = ''
      if (d.path === 'agent' && PROFILE_AGENTS.includes(d.agent)) {
        const profile = record(
          await execute('connection.profile', { agent: d.agent, model: d.model, key_id: keyId })
        )
        command = String(profile['launch_command'] ?? profile['command'] ?? '')
      }
      patch({ step: 'done', command, endpoint: String(info['endpoint'] ?? (await c.localEndpoint())) })
    } catch (e) {
      patch({ step: 'review', error: e instanceof Error ? e.message : String(e) })
    }
  } else return false
  return true
}
export const connectionAgentName = (id: string) => CONNECTION_AGENTS.find((a) => a.id === id)?.label ?? id
