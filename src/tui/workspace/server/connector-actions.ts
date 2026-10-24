import { MCP_CONNECTORS } from '../../../contract/index.js'
import type { ConnectorConfig } from '../../../contract/index.js'
import {
  connectorDraft,
  connectorJson,
  connectorTemplate,
  parseConnectorJson,
} from '../../../workspace-view/index.js'
import type { ActionContext } from '../actions.js'
import { featureData, featureDraft } from './feature-model.js'
async function refresh(ctx: ActionContext) {
  const features = (await ctx.controller.runtime.execute('features.get')) as ReturnType<typeof featureData>
  ctx.update((s) => ({ ...s, workspace: s.workspace ? { ...s.workspace, features } : s.workspace }))
}
async function signIn(ctx: ActionContext, config: ConnectorConfig, clientId = '') {
  let auth: { url: string }
  try {
    auth = (await ctx.controller.runtime.execute('connectors.oauth.start', {
      id: config.id,
      ...(clientId.trim() ? { client_id: clientId.trim() } : {}),
    })) as { url: string }
  } catch (error) {
    ctx.update((s) => ({
      ...s,
      overlay: 'feature-editor',
      featureEditor: featureDraft('connector-oauth-client', {
        id: config.id,
        name: config.name,
        client_id: clientId,
      }),
      focus: 'feature-field:client_id',
      message: error instanceof Error ? error.message : String(error),
    }))
    return
  }
  ctx.update((s) => ({
    ...s,
    overlay: 'feature-editor',
    featureEditor: featureDraft('connector-oauth', { id: config.id, name: config.name, url: auth.url }),
    focus: 'feature-connector-open',
    message: '',
  }))
  await ctx.controller.run({ name: 'open-url', url: auth.url })
  const poll = async () => {
    if (
      ctx.get().featureEditor?.kind !== 'connector-oauth' ||
      ctx.get().featureEditor?.value['id'] !== config.id
    )
      return
    try {
      const status = (await ctx.controller.runtime.execute('connectors.oauth.status', { id: config.id })) as {
        state: string
        error?: string
      }
      if (
        ctx.get().featureEditor?.kind !== 'connector-oauth' ||
        ctx.get().featureEditor?.value['id'] !== config.id
      )
        return
      if (status.state === 'complete') {
        await ctx.controller.runtime.execute('connectors.check', { id: config.id })
        await refresh(ctx)
        ctx.update((s) => ({
          ...s,
          overlay: null,
          featureEditor: undefined,
          focus: 'feature-add',
          message: '',
        }))
      } else if (status.state === 'error' || status.state === 'cancelled' || status.state === 'idle')
        ctx.update((s) => ({
          ...s,
          message: status.error ?? 'Sign-in cancelled.',
          featureEditor: undefined,
          overlay: null,
        }))
      else setTimeout(() => void poll(), 1000)
    } catch (e) {
      ctx.update((s) => ({
        ...s,
        message: e instanceof Error ? e.message : String(e),
        overlay: null,
        featureEditor: undefined,
      }))
    }
  }
  setTimeout(() => void poll(), 700)
}
export async function connectorAction(id: string, ctx: ActionContext): Promise<boolean> {
  const s = ctx.get(),
    editor = s.featureEditor,
    data = featureData(s),
    special = editor?.kind.startsWith('connector-')
  if (id === 'close' && editor?.kind === 'connector-oauth')
    await ctx.controller.runtime.execute('connectors.oauth.cancel', { id: editor.value['id'] })
  if (id === 'close') return false
  if (!id.startsWith('feature-connector-') && !(id === 'feature-save' && special)) return false
  if (s.busy) return true
  const action = id.slice('feature-connector-'.length).split(':')[0],
    key = id.slice(id.indexOf(':') + 1),
    config = data.connectors.find((c) => c.id === key)
  const open = (
    kind: typeof editor extends never ? never : Parameters<typeof featureDraft>[0],
    value: object,
    focus: string
  ) =>
    ctx.update((v) => ({
      ...v,
      overlay: 'feature-editor',
      featureEditor: featureDraft(kind, value),
      focus,
      scroll: 0,
      message: '',
    }))
  if (action === 'json') {
    open(
      'connector-json',
      { content: connectorJson(config ? [config] : data.connectors), scope: config?.id ?? '' },
      'feature-field:content'
    )
    return true
  }
  if (action === 'menu' && config) {
    open(
      'connector-menu',
      { id: config.id, name: config.name, oauth: connectorTemplate(config)?.auth === 'oauth' },
      `feature-connector-edit:${key}`
    )
    return true
  }
  if (action === 'tools' && config) {
    open('connector-tools', { id: key, name: config.name }, 'close')
    return true
  }
  if (action === 'edit' && config) {
    open('connectors', config, 'feature-field:name')
    return true
  }
  if (action === 'delete' && config) {
    ctx.update((v) => ({
      ...v,
      overlay: 'feature-delete',
      edit: key,
      focus: 'feature-confirm-delete',
      featureEditor: undefined,
    }))
    return true
  }
  if (action === 'help' || action === 'open') {
    const url = editor?.value[action === 'help' ? 'help' : 'url']
    if (url) await ctx.controller.run({ name: 'open-url', url })
    return true
  }
  const template = MCP_CONNECTORS.find((t) => t.serverKey === key)
  if (action === 'setup' && template?.secret) {
    open(
      'connector-secret',
      {
        id: key,
        name: template.name,
        label: template.secret.label,
        help: template.secret.helpUrl ?? '',
        secret: '',
      },
      'feature-field:secret'
    )
    return true
  }
  ctx.update((v) => ({ ...v, busy: true, message: '' }))
  try {
    if (id === 'feature-save' && editor?.kind === 'connector-oauth-client') {
      const target = data.connectors.find((c) => c.id === editor.value['id'])
      if (target) await signIn(ctx, target, editor.value['client_id'])
      return true
    }
    if (id === 'feature-save' && editor?.kind === 'connector-json') {
      const value = parseConnectorJson(editor.value['content'] ?? '')
      if (editor.value['scope'])
        value.mcpServers = {
          ...parseConnectorJson(connectorJson(data.connectors.filter((c) => c.id !== editor.value['scope'])))
            .mcpServers,
          ...value.mcpServers,
        }
      await ctx.controller.runtime.execute('connectors.import', { value })
    } else if ((id === 'feature-save' && editor?.kind === 'connector-secret') || action === 'setup') {
      const item =
        id === 'feature-save' ? MCP_CONNECTORS.find((t) => t.serverKey === editor?.value['id']) : template
      if (!item) return true
      const draft = connectorDraft(item, editor?.kind === 'connector-secret' ? editor.value['secret'] : '')
      await ctx.controller.runtime.execute('connectors.save', { value: draft })
      if (item.auth === 'oauth') {
        await signIn(ctx, draft)
        await refresh(ctx)
        return true
      }
      await ctx.controller.runtime.execute('connectors.check', { id: draft.id })
    } else if (action === 'signin' && config) {
      await signIn(ctx, config)
      return true
    } else if (action === 'connect' && config)
      await ctx.controller.runtime.execute('connectors.check', { id: key })
    else if (action === 'toggle' && config)
      await ctx.controller.runtime.execute('connectors.save', {
        value: { ...config, enabled: !config.enabled },
      })
    await refresh(ctx)
    ctx.update((v) => ({ ...v, overlay: null, featureEditor: undefined, focus: 'feature-add' }))
  } finally {
    ctx.update((v) => ({ ...v, busy: false }))
  }
  return true
}
