import { SUPPORT_LINKS } from '../support.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceState } from '../state.js'
import { PAGE_FOCUS } from '../state.js'
import {
  defaultInput,
  fieldValue,
  inputObject,
  operationChoices,
  operationFields,
  parseField,
  setField,
} from './operation-model.js'
import { WORKSPACE_OPERATIONS } from '../../../contract/index.js'

export async function operationAction(id: string, ctx: ActionContext): Promise<boolean> {
  const { get, controller: c, update } = ctx,
    s = get()
  const patch = (part: Partial<WorkspaceState>) => update((v) => ({ ...v, ...part }))
  const op = s.operations.find((v) => v.name === s.operation)
  const pick = (name: string) => {
    const action = s.operations.find((v) => v.name === name)
    const previous = inputObject(s.operationInput)
    const retained = Object.fromEntries(
      Object.entries(previous).filter(([key]) => key in (action?.inputSchema.properties ?? {}))
    )
    if (action)
      patch({
        operation: name,
        operationInput: JSON.stringify({ ...inputObject(defaultInput(action, s)), ...retained }),
        operationResult: '',
        overlay: null,
        selected: 0,
        scroll: 0,
        edit: '',
        focus: operationFields(action)[0]
          ? `operation-field:${operationFields(action)[0]!.path}`
          : 'operation-run',
      })
  }
  if (id.startsWith('support:')) {
    const link = SUPPORT_LINKS.find((item) => item.id === id)
    if (link) await c.run({ name: 'open-url', url: link.url })
    return true
  }
  if (id === 'help' || id === 'menu') {
    patch({ overlay: id, focus: id === 'help' ? 'support:email' : 'page:server' })
    return true
  }
  if (id === 'agent-setup') {
    patch({ overlay: 'agent-setup', focus: 'copy-agent-brief' })
    return true
  }
  if (id === 'copy-agent-brief') {
    ctx.copy(c.runtime.agentBrief())
    patch({ message: 'Setup brief copied.' })
    return true
  }
  if (id === 'setup-manual') {
    await c.runtime.execute('setup.manual')
    await c.save('tui.mode', 'server')
    patch({
      setupComplete: true,
      setup: null,
      page: 'server',
      serverView: 'overview',
      overlay: null,
      focus: 'api-toggle',
      message: '',
    })
    return true
  }
  if (id === 'open-admin') {
    await c.runtime.openAdmin()
    return true
  }
  if (id === 'api-ping' || id === 'api-restart') {
    if (id === 'api-restart' && s.workspace?.api.running) {
      patch({ overlay: 'stop', edit: 'api-restart', focus: 'close' })
      return true
    }
    patch({ busy: true, message: id === 'api-ping' ? 'Pinging API…' : 'Restarting API…' })
    try {
      const result = await c.runtime.execute(id === 'api-ping' ? 'api.ping' : 'api.restart')
      patch({
        message: id === 'api-ping' ? `Ping: ${JSON.stringify(result)}` : 'API restarted.',
        workspace: await c.runtime.snapshot(),
      })
      await c.run({ name: 'refresh' })
    } finally {
      patch({ busy: false })
    }
    return true
  }
  if (id === 'stop-confirm' && s.edit === 'api-restart') {
    patch({ overlay: null, edit: '', busy: true, message: 'Restarting API…' })
    try {
      await c.runtime.execute('api.restart')
      patch({ workspace: await c.runtime.snapshot(), message: 'API restarted.' })
    } finally {
      patch({ busy: false })
    }
    return true
  }
  if (id === 'metrics') {
    patch({
      operations: [...WORKSPACE_OPERATIONS],
      operation: 'api.inspector',
      operationInput: JSON.stringify({ enabled: !s.workspace?.metrics.detailed }),
      page: 'tools',
      toolGroup: 'api',
      operationReturn: 'requests',
      operationResult: '',
      edit: '',
      focus: 'operation-run',
      selected: 0,
      scroll: 0,
    })
    return true
  }
  if (id.startsWith('tools:')) {
    const toolGroup = id.slice(6),
      operations = [...WORKSPACE_OPERATIONS]
    const chosen = operationChoices({ ...s, operations, toolGroup })
    patch({
      operations,
      toolGroup,
      page: 'tools',
      operationReturn: s.page === 'tools' ? s.operationReturn : s.page,
      overlay: 'operation-choice',
      operationField: 'operation',
      operationChoices: chosen.map((v) => v.name),
      focus: 'operation-choice:0',
      selected: 0,
      edit: '',
      scroll: 0,
    })
    return true
  }
  if (id === 'operation-back') {
    patch({ page: s.operationReturn, focus: PAGE_FOCUS[s.operationReturn], edit: '', overlay: null })
    return true
  }
  if (id === 'operation-select') {
    patch({
      overlay: 'operation-choice',
      operationChoices: operationChoices(s).map((v) => v.name),
      operationField: 'operation',
      focus: 'operation-choice:0',
      selected: 0,
    })
    return true
  }
  if (id.startsWith('operation-choice:')) {
    const value = s.operationChoices[Number(id.slice(17))]
    if (value !== undefined) {
      if (s.operationField === 'operation') pick(value)
      else
        patch({
          operationInput: setField(s.operationInput, s.operationField, value),
          overlay: null,
          focus: `operation-field:${s.operationField}`,
        })
    }
    return true
  }
  if (id.startsWith('operation-field:')) {
    const path = id.slice(16),
      field = op && operationFields(op).find((f) => f.path === path)
    if (!field) return true
    const value = fieldValue(s.operationInput, path)
    if (field.schema.type === 'boolean')
      patch({ operationInput: setField(s.operationInput, path, value !== true) })
    else if (field.schema.enum)
      patch({
        overlay: 'operation-choice',
        operationChoices: [...field.schema.enum],
        operationField: path,
        focus: `operation-choice:${Math.max(0, field.schema.enum.indexOf(String(value)))}`,
        selected: 0,
      })
    else
      patch({
        overlay: 'endpoint',
        edit: `operation-field:${path}`,
        editValue:
          value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value),
        focus: 'save-edit',
      })
    return true
  }
  if (id === 'operation-json') {
    patch({ overlay: 'endpoint', edit: 'operation-json', editValue: s.operationInput, focus: 'save-edit' })
    return true
  }
  if (id === 'save-edit' && s.edit.startsWith('operation-')) {
    if (s.edit === 'operation-json') {
      inputObject(s.editValue)
      patch({ operationInput: s.editValue })
    } else if (op) {
      const path = s.edit.slice(16),
        field = operationFields(op).find((f) => f.path === path)
      if (field)
        patch({ operationInput: setField(s.operationInput, path, parseField(field.schema, s.editValue)) })
    }
    patch({ overlay: null, edit: '', focus: 'operation-run' })
    return true
  }
  if (id === 'operation-output' || id === 'operation-fields') {
    patch({ edit: id === 'operation-output' ? id : '', focus: id, scroll: 0, selected: 0 })
    return true
  }
  if (id === 'operation-copy') {
    ctx.copy(s.operationResult)
    patch({ message: 'Result copied.' })
    return true
  }
  if (id === 'operation-up' || id === 'operation-down') {
    patch({
      scroll: Math.max(0, s.scroll + (id.endsWith('up') ? -3 : 3)),
      selected: Math.max(0, s.selected + (id.endsWith('up') ? -3 : 3)),
    })
    return true
  }
  if ((id === 'scroll-up' || id === 'scroll-down') && (s.page === 'tools' || s.overlay === 'console'))
    return operationAction(id === 'scroll-up' ? 'operation-up' : 'operation-down', ctx)
  if (id === 'console') {
    patch({ overlay: 'console', focus: 'console-input', scroll: 0 })
    return true
  }
  if (id === 'console-input') {
    patch({ focus: id })
    return true
  }
  if (id === 'console-run' || id === 'operation-run') {
    if (s.busy) return true
    let name = s.operation,
      input = inputObject(s.operationInput)
    if (id === 'console-run') {
      const split = s.consoleInput.trim().match(/^(\S+)(?:\s+([\s\S]+))?$/)
      if (!split) return true
      name = split[1]!
      input = inputObject(split[2] ?? '{}')
    }
    patch({ busy: true, message: `Running ${name}…` })
    try {
      const result = await c.runtime.execute(name, input)
      patch({
        operationResult: JSON.stringify(result, null, 2),
        message: '',
        edit: 'operation-output',
        focus: id === 'console-run' ? 'console-input' : 'operation-output',
        scroll: 0,
      })
    } finally {
      patch({ busy: false })
    }
    return true
  }
  return false
}
