import type { ConnectionDraft } from '../../../contract/index.js'
import { CONNECTION_AGENTS, DEFAULT_API_PORT, PROFILE_AGENTS } from '../../../contract/index.js'
import { setupWait } from '../../../terminal-setup/index.js'
import type { ActionContext } from '../actions.js'
import { workspaceLocation } from '../navigation/navigation-return.js'
import { record } from '../library/library-model.js'
import { setupAction } from '../setup/setup-actions.js'
import { connectionPickerAction } from './connection-picker.js'
import { connectionModels, connectionSelection, readConnectionEngines } from './connection-selection.js'
import {
  connectionApiOperation,
  connectionDownload,
  connectionDownloadTarget,
} from '../../../workspace-view/index.js'
const rows = (value: unknown) =>
  Array.isArray(value)
    ? value.map(record)
    : Array.isArray(record(value)['rows'])
      ? (record(value)['rows'] as unknown[]).map(record)
      : []
const READING_CONNECTION_OPTIONS = 'Checking installed models and engines…'

export async function connectionGuideAction(id: string, ctx: ActionContext): Promise<boolean> {
  if (connectionPickerAction(id, ctx)) return true
  const s = ctx.get(),
    c = ctx.controller
  // Focus follows the step: review has Configure, done has Copy, the endpoint form has Next.
  const focusFor = (step: ConnectionDraft['step'] | undefined, current: string) =>
    step === 'review'
      ? 'guide-configure'
      : step === 'done'
        ? 'guide-copy'
        : step === 'endpoint'
          ? 'guide-next'
          : current
  const patch = (p: Partial<ConnectionDraft>, focus?: string) =>
    ctx.update((v) => ({
      ...v,
      connection: v.connection ? { ...v.connection, ...p } : null,
      focus: v.connection ? (focus ?? focusFor(p.step, v.focus)) : v.focus,
      hover: '',
    }))
  if (id === 'guide-manual') {
    await connectionGuideAction('guide-close', ctx)
    ctx.update((v) => ({ ...v, serverView: 'overview', focus: 'api-toggle' }))
    return true
  }
  if (id === 'guide-open' || id.startsWith('guide-agent:')) {
    if (s.message === READING_CONNECTION_OPTIONS) return true
    const openingHere = () => {
      const current = ctx.get()
      return (
        current.message === READING_CONNECTION_OPTIONS &&
        current.page === s.page &&
        current.overlay === s.overlay &&
        current.firstRun === s.firstRun
      )
    }
    ctx.update((v) => ({ ...v, message: READING_CONNECTION_OPTIONS }))
    const options = await setupWait(
      Promise.all([c.installed(), readConnectionEngines(c)]),
      new AbortController().signal
    ).catch((error: unknown) => {
      if (openingHere())
        ctx.update((v) => ({
          ...v,
          message: `Could not open connection setup. ${error instanceof Error ? error.message : String(error)}`,
        }))
      return null
    })
    if (!openingHere()) {
      ctx.update((v) => (v.message === READING_CONNECTION_OPTIONS ? { ...v, message: '' } : v))
      return true
    }
    if (!options) return true
    const [installed, connectionEngines] = options
    const download = connectionDownloadTarget(connectionDownload(s.workspace?.setups ?? []))
    const preferred =
      s.setup?.selections[0]?.plan.model_id ?? s.setup?.path?.job?.model ?? (s.model || download.model)
    const models = { ...s, installed, connectionEngines }
    const model = preferred || connectionModels(models)[0]?.id || ''
    const provider = s.setup?.selections[0]?.plan.provider ?? s.setup?.path?.job?.engine ?? download.provider
    const selected = connectionSelection(models, model, provider, false)
    const agent = id.startsWith('guide-agent:') ? id.slice(12) : ''
    ctx.update((v) => ({
      ...v,
      installed,
      connectionEngines,
      connectionReturn: s.firstRun ? undefined : (s.connectionReturn ?? workspaceLocation(s)),
      overlay: 'connection-guide',
      focus: agent ? 'guide-configure' : 'guide-path:agent',
      message: '',
      connection: {
        step: agent ? 'review' : 'choose',
        path: 'agent',
        agent: agent || 'claude',
        model,
        provider: selected.provider,
        port: String(v.workspace?.api.port || DEFAULT_API_PORT),
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
    // Kept as typed, so a wrong port is corrected rather than retyped; the step says what is wrong.
    patch({ port: s.editValue.trim(), error: guidePortError(s.editValue) })
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
  } else if (id === 'guide-next') {
    const error = guidePortError(d.port)
    patch(error ? { error } : { step: 'review', error: '' })
  } else if (id === 'guide-back') {
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
      // A download the person chose to run in the background keeps its progress poll and finish.
      setup: v.setup?.destination ? v.setup : null,
      connection: null,
      overlay: null,
      page: 'server',
      serverView: 'connect',
      focus: 'guide-open',
      ...(!s.firstRun ? s.connectionReturn : {}),
      connectionReturn: undefined,
    }))
  } else if (id === 'guide-copy') await ctx.copy(d.command || d.endpoint)
  else if (id === 'guide-key') {
    const key = await c.runtime.execute('keys.reveal', { id: d.keyId })
    await ctx.copy(typeof key === 'string' ? key : String(record(key)['token'] ?? record(key)['key'] ?? ''))
  } else if (id === 'guide-configure') {
    const selected = connectionSelection(s)
    if (!selected.ready) {
      patch({ error: selected.status })
      return true
    }
    if (!selected.provider || guidePortError(d.port)) {
      patch({ error: selected.provider ? guidePortError(d.port) : 'Choose a downloaded model.' })
      return true
    }
    patch({ step: 'preparing', error: '', status: 'Checking installed engines' })
    const connectionEngines = await readConnectionEngines(c)
    ctx.update((v) => ({ ...v, connectionEngines }))
    if (!connectionEngines?.includes(selected.provider)) {
      const error = connectionEngines
        ? 'The selected engine is no longer installed.'
        : 'Could not check installed engines.'
      patch({ step: 'review', error }, 'guide-engine')
      return true
    }
    try {
      patch({ status: 'Loading model' })
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
      await execute(connectionApiOperation(s.workspace?.api, { host: '127.0.0.1', port: Number(d.port) }), {
        request: { host: '127.0.0.1', port: Number(d.port) },
      })
      patch({ status: 'Testing model response' })
      await execute('setup.complete', { model_id: d.model })
      const info = record(await execute('connection.info'))
      let command = ''
      let agentConfigured: boolean | undefined
      let agentSetupNote = ''
      if (
        d.path === 'agent' &&
        Array.isArray(info['configurable_agents']) &&
        info['configurable_agents'].includes(d.agent)
      ) {
        patch({ status: 'Configuring agent on this host' })
        const configured = record(
          await execute('connection.configure', { agent: d.agent, model: d.model, key_id: keyId })
        )
        agentConfigured = configured['configured'] === true
        agentSetupNote = String(configured['reason'] ?? '')
        command = String(configured['launch_command'] ?? '')
      } else if (d.path === 'agent' && PROFILE_AGENTS.includes(d.agent)) {
        const profile = record(
          await execute('connection.profile', { agent: d.agent, model: d.model, key_id: keyId })
        )
        command = String(profile['launch_command'] ?? profile['command'] ?? '')
      }
      patch({
        step: 'done',
        command,
        ...(agentConfigured === undefined ? {} : { agentConfigured }),
        agentSetupNote,
        endpoint: String(info['endpoint'] ?? (await c.localEndpoint())),
      })
    } catch (e) {
      patch({ step: 'review', error: e instanceof Error ? e.message : String(e) })
    }
  } else return false
  return true
}
export const connectionAgentName = (id: string) => CONNECTION_AGENTS.find((a) => a.id === id)?.label ?? id

/** The endpoint's port: a whole number from 1 to 65535 (the guide names a URL, so not 0). */
export function guidePortError(value: string): string {
  const port = value.trim()
  return /^\d+$/.test(port) && Number(port) >= 1 && Number(port) <= 65535
    ? ''
    : 'Enter a port from 1 to 65535.'
}
