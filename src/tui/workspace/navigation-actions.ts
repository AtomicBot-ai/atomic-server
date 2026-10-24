import { moveSettings } from './server/settings-model.js'
import { navigationReturnAction } from './navigation-return.js'
import { mediaAction } from './media/media-actions.js'
import { imageAction } from './chat/image-actions.js'
import { remoteAction } from './server/remote-actions.js'
import { serverShellAction } from './server/server-shell-actions.js'
import {
  WORKSPACE_OPERATIONS,
  PLAYGROUND_TASKS,
  SETTINGS_SECTIONS,
  SETTINGS_WORKSPACE_SECTIONS,
} from '../../contract/index.js'
import type { ActionContext } from './actions.js'
import { defaultInput, operationFields } from './operations/operation-model.js'
import { PAGE_FOCUS } from './state.js'
import { SERVER_PAGES, sectionMenu } from './navigation.js'

export async function navigationAction(id: string, ctx: ActionContext): Promise<boolean> {
  if (navigationReturnAction(id, ctx)) return true
  if (await serverShellAction(id, ctx)) return true
  const s = ctx.get()
  if (id === 'settings-attach-image') {
    ctx.update((v) => ({ ...v, page: 'chat', serverView: 'overview', overlay: null, focus: 'composer' }))
    return imageAction('images', ctx)
  }
  if (id === 'settings-hardware-refresh') {
    if (s.busy) return true
    ctx.update((v) => ({ ...v, busy: true }))
    try {
      const result = await ctx.controller.runtime.execute('hardware.info')
      ctx.update((v) => ({
        ...v,
        operationResult: JSON.stringify(result),
        focus: 'settings-hardware-refresh',
      }))
    } finally {
      ctx.update((v) => ({ ...v, busy: false }))
    }
    return true
  }
  if (id === 'section-menu') {
    const menu = sectionMenu(s)
    ctx.update((v) => ({ ...v, overlay: 'sections', focus: `${menu.prefix}:${menu.items[0]?.id}` }))
    return true
  }
  if (id === 'switch-mode') {
    ctx.update((v) => ({ ...v, page: 'server', serverView: 'overview', overlay: null, focus: 'api-toggle' }))
    return true
  }
  if ((id === 'scroll-up' || id === 'scroll-down') && s.page === 'access') {
    const delta = id === 'scroll-up' ? -1 : 1
    ctx.update((v) => ({ ...v, ...moveSettings(v, delta), scroll: Math.max(0, v.scroll + delta) }))
    return true
  }
  if (id.startsWith('settings-section:')) {
    const group = id.slice(17)
    if (
      !s.setupComplete ||
      ![...SETTINGS_SECTIONS, ...SETTINGS_WORKSPACE_SECTIONS].some((item) => item.id === group)
    )
      return true
    if (group === 'hardware') {
      ctx.update((v) => ({ ...v, page: 'access', serverView: 'overview', settingsGroup: 'hardware' }))
      await navigationAction('open-operation:hardware.info', ctx)
      return navigationAction('settings-hardware-refresh', ctx)
    }
    const page = group === 'tui' ? 'settings' : 'access'
    ctx.update((v) => ({
      ...v,
      page,
      settingsGroup: group,
      serverView: 'overview',
      selected: 0,
      scroll: 0,
      overlay: null,
      hover: '',
      edit: '',
      message: '',
      focus:
        page === 'access'
          ? group === 'admin'
            ? 'setting:admin.openOnStart'
            : `settings-section:${group}`
          : PAGE_FOCUS[page],
    }))
    return true
  }
  if (id.startsWith('server-section:')) {
    const page = SERVER_PAGES[id.slice(15)]
    if (!page || !s.setupComplete) return true
    ctx.update((v) => ({
      ...v,
      page,
      serverView: id.slice(15),
      ...(id === 'server-section:configuration' ? { settingsGroup: 'api' } : {}),
      ...(id === 'server-section:proxy' ? { settingsGroup: 'proxy' } : {}),
      overlay: null,
      selected: 0,
      scroll: 0,
      hover: '',
      message: '',
      edit: '',
      focus:
        (
          {
            overview: 'server-search',
            connect: 'guide-open',
            model: 'server-engine',
            configuration: 'server-host',
            remote: 'remote-toggle',
            proxy: 'setting:proxy.url',
          } as Record<string, string>
        )[id.slice(15)] ?? PAGE_FOCUS[page],
    }))
    if (id === 'server-section:remote') await remoteAction('remote-refresh', ctx)
    return true
  }
  if (id.startsWith('playground-task:')) {
    if (!s.setupComplete) return true
    const task = id.slice(16)
    if (!PLAYGROUND_TASKS.some((v) => v.id === task)) return true
    if (task === 'chat') {
      ctx.update((v) => ({
        ...v,
        page: 'chat',
        overlay: null,
        focus: 'composer',
        hover: '',
        edit: '',
        scroll: 0,
      }))
      return true
    }
    const name = `media.${task}.${task === 'image' || task === 'video' ? 'create' : 'run'}`
    const operation = WORKSPACE_OPERATIONS.find((v) => v.name === name)!
    ctx.update((v) => ({
      ...v,
      page: 'tools',
      operationReturn: 'chat',
      operations: [...WORKSPACE_OPERATIONS],
      toolGroup: `task:${task}`,
      operation: name,
      operationInput: defaultInput(operation, v),
      media: {
        ...v.media,
        capabilities: {},
        gallery: [],
        models: [],
        selected: 0,
        error: '',
        galleryView: false,
      },
      operationResult: '',
      overlay: null,
      focus: 'operation-field:request.workflow',
      hover: '',
      edit: '',
      selected: 0,
      scroll: 0,
      message: '',
    }))
    await mediaAction('media-refresh', ctx)
    return true
  }
  if (id.startsWith('open-operation:')) {
    const name = id.slice(15),
      operation = WORKSPACE_OPERATIONS.find((v) => v.name === name)
    if (!operation || !s.setupComplete) return true
    ctx.update((v) => ({
      ...v,
      page: 'tools',
      operationReturn: v.page === 'tools' ? v.operationReturn : v.page,
      operations: [...WORKSPACE_OPERATIONS],
      toolGroup: operation.group,
      operation: name,
      operationInput: defaultInput(operation, v),
      operationResult: '',
      overlay: null,
      focus: operationFields(operation).length
        ? `operation-field:${operationFields(operation)[0]!.path}`
        : 'operation-run',
      hover: '',
      edit: '',
      selected: 0,
      scroll: 0,
      message: '',
    }))
    return true
  }
  return false
}
