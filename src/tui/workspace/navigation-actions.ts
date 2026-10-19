import { WORKSPACE_OPERATIONS, PLAYGROUND_TASKS } from '../../contract/index.js'
import type { ActionContext } from './actions.js'
import { defaultInput, operationFields } from './operations/operation-model.js'
import { PAGE_FOCUS } from './state.js'
import { SERVER_PAGES } from './navigation.js'

export async function navigationAction(id: string, ctx: ActionContext): Promise<boolean> {
  const s = ctx.get()
  if ((id === 'scroll-up' || id === 'scroll-down') && s.page === 'access') {
    const count = s.base.config.rows.filter((r) => r.path.startsWith('api.')).length
    ctx.update((v) => ({
      ...v,
      selected: Math.max(0, Math.min(count - 1, v.selected + (id === 'scroll-up' ? -3 : 3))),
      hover: '',
    }))
    return true
  }
  if (id.startsWith('server-section:')) {
    const page = SERVER_PAGES[id.slice(15)]
    if (!page || !s.setupComplete) return true
    ctx.update((v) => ({
      ...v,
      page,
      overlay: null,
      selected: 0,
      scroll: 0,
      hover: '',
      message: '',
      edit: '',
      focus: PAGE_FOCUS[page],
    }))
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
      operationResult: '',
      overlay: null,
      focus: `operation-field:${operationFields(operation)[0]?.path ?? ''}`,
      hover: '',
      edit: '',
      selected: 0,
      scroll: 0,
      message: '',
    }))
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
