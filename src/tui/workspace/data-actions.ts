import type { ActionContext } from './actions.js'
import type { WorkspaceState } from './state.js'
import { modelProvider } from '../../terminal-setup/index.js'
export async function persistConversation(ctx: Pick<ActionContext, 'get' | 'controller'>): Promise<void> {
  const s = ctx.get()
  if (s.conversation && s.messages.length)
    await ctx.controller.history.save({
      ...s.conversation,
      endpoint: s.endpoint,
      model: s.model,
      messages: s.messages,
      interrupted: s.generating,
    })
}
export async function dataAction(id: string, ctx: ActionContext): Promise<boolean> {
  const { get, update, controller: c } = ctx,
    s = get()
  const patch = (p: Partial<WorkspaceState>) => update((v) => ({ ...v, ...p }))
  if (id === 'scroll-up' || id === 'scroll-down') {
    const delta = id === 'scroll-up' ? -3 : 3
    if (s.page === 'history' || s.page === 'keys' || s.page === 'models' || s.page === 'setup') {
      const length =
        s.page === 'history'
          ? s.history.length
          : s.page === 'keys'
            ? s.clientKeys.length
            : s.page === 'models'
              ? s.installed.length + s.models.filter((m) => !s.installed.some((i) => i.id === m)).length
              : s.setup?.stage === 'models'
                ? s.setup.repository
                  ? s.setup.files.length
                  : s.setup.repositories.length
                : (s.setup?.selections.length ?? 0)
      patch({ selected: Math.max(0, Math.min(length - 1, s.selected + delta)), hover: '' })
      return true
    }
    return false
  }
  if (id === 'page:history') {
    await persistConversation(ctx)
    patch({
      history: await c.history.list(),
      page: 'history',
      overlay: null,
      selected: 0,
      focus: 'history-search',
    })
  } else if (id === 'history-search') {
    patch({ overlay: 'endpoint', edit: 'history-search', editValue: s.historyFilter, focus: 'save-edit' })
  } else if (id.startsWith('history:')) {
    const chat = await c.history.load(id.slice(8))
    if (!chat) throw new Error('This conversation is no longer available.')
    await persistConversation(ctx)
    ctx.cancel()
    patch({
      conversation: chat,
      messages: chat.messages,
      images: [],
      endpoint: chat.endpoint,
      model: chat.model,
      page: 'chat',
      focus: 'composer',
      draft: '',
      cursor: 0,
      scroll: 0,
      message: chat.interrupted ? 'Resumed conversation. The last response was interrupted.' : '',
    })
  } else if (id === 'rename-chat') {
    if (!s.conversation) return true
    patch({ overlay: 'endpoint', edit: 'rename-chat', editValue: s.conversation.title, focus: 'save-edit' })
  } else if (id === 'delete-chat') {
    if (s.conversation) patch({ overlay: 'delete-chat', focus: 'close' })
  } else if (id === 'delete-chat-confirm') {
    if (s.conversation) await c.history.remove(s.conversation.id)
    ctx.cancel()
    patch({
      conversation: null,
      messages: [],
      page: 'chat',
      overlay: null,
      focus: 'composer',
      history: await c.history.list(),
      message: 'Conversation deleted.',
    })
  } else if (id === 'page:keys') {
    await c.initializeKeys()
    patch({
      page: 'keys',
      clientKeys: await c.keys.list(),
      overlay: null,
      focus: 'key-new',
      secret: '',
      selected: 0,
    })
  } else if (id === 'key-new') {
    patch({ overlay: 'endpoint', edit: 'key-name', editValue: '', focus: 'save-edit' })
  } else if (id.startsWith('key-copy:') || id === 'copy-key') {
    const token = await c.keys.get(id === 'copy-key' ? undefined : id.slice(9))
    if (token) ctx.copy(token)
    patch({ message: 'API key sent to the terminal clipboard.' })
  } else if (id.startsWith('key-reveal:')) {
    patch({ secret: await c.keys.get(id.slice(11)), overlay: 'credential', focus: 'copy-secret' })
  } else if (id === 'copy-secret') {
    ctx.copy(s.secret)
    patch({ message: 'API key sent to the terminal clipboard.' })
  } else if (id.startsWith('key-revoke:'))
    patch({ editValue: id.slice(11), overlay: 'revoke-key', focus: 'close' })
  else if (id === 'revoke-key-confirm') {
    await c.keys.revoke(s.editValue)
    patch({
      clientKeys: await c.keys.list(),
      overlay: null,
      secret: '',
      message: 'Key revoked. New requests using it will be refused.',
    })
  } else if (id.startsWith('installed:')) {
    const model = s.installed[Number(id.slice(10))]
    if (!model) return true
    patch({ busy: true, message: `Loading ${model.name}...` })
    try {
      await c.loadModel(modelProvider(s.engine, model.provider), model.id)
      const endpoint = await c.localEndpoint()
      await c.save('tui.model', model.id)
      await c.save('tui.endpoint', endpoint)
      patch({
        model: model.id,
        endpoint,
        page: 'chat',
        focus: 'composer',
        overlay: null,
        hover: '',
        message: 'Model loaded. Ready for chat and API requests.',
      })
    } finally {
      patch({ busy: false })
    }
  } else return false
  return true
}
export async function saveDataEdit(ctx: ActionContext): Promise<boolean> {
  const { get, update, controller: c } = ctx,
    s = get()
  if (s.edit === 'setup-query') {
    update((v) => ({ ...v, setup: v.setup ? { ...v.setup, query: s.editValue } : null, overlay: null }))
    return true
  }
  if (s.edit === 'history-search') {
    update((v) => ({ ...v, historyFilter: s.editValue, selected: 0, overlay: null }))
    return true
  }
  if (s.edit === 'key-name') {
    const key = await c.keys.create(s.editValue)
    update((v) => ({ ...v, secret: key.token, overlay: 'credential', focus: 'copy-secret' }))
    const clientKeys = await c.keys.list()
    update((v) => ({ ...v, clientKeys }))
    return true
  }
  if (s.edit === 'rename-chat' && s.conversation) {
    const title = s.editValue.trim().slice(0, 100)
    if (!title) throw new Error('Give this conversation a title.')
    const chat = { ...s.conversation, title, messages: s.messages }
    await c.history.save(chat)
    update((v) => ({
      ...v,
      conversation: chat,
      overlay: null,
      history: v.history.map((h) => (h.id === chat.id ? { ...h, title } : h)),
    }))
    return true
  }
  return false
}
