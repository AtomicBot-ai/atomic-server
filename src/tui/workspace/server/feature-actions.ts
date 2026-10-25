import { profileAction } from './profile-actions.js'
import { profileInput } from './profile-layout.js'
import { connectorAction } from './connector-actions.js'
import type { Key } from 'ink'
import type { ActionContext } from '../actions.js'
import type { InputResult } from '../input-types.js'
import type { WorkspaceState } from '../state.js'
import { featureData, featureDraft, editorValue, featureFields } from './feature-model.js'
export async function featureAction(id: string, ctx: ActionContext): Promise<boolean> {
  if (await profileAction(id, ctx)) return true
  if (await connectorAction(id, ctx)) return true
  const s = ctx.get(),
    data = featureData(s)
  if (
    !id.startsWith('feature-') &&
    !(id === 'close' && (s.overlay === 'feature-editor' || s.overlay === 'feature-delete'))
  )
    return false
  if (id === 'close') {
    ctx.update((v) => ({
      ...v,
      overlay: null,
      featureEditor: undefined,
      focus: s.settingsGroup === 'skills' ? 'feature-skill-create' : 'feature-add',
      message: '',
    }))
    return true
  }
  if (s.busy) return true
  if (id === 'feature-save') {
    if (!s.featureEditor) return true
    const { kind } = s.featureEditor,
      value = editorValue(s.featureEditor)
    if (kind === 'export') {
      const result = (await ctx.controller.runtime.execute('skills.export', { id: value['id'] })) as {
        data: string
      }
      const path = await ctx.controller.saveFile(String(value['path']), result.data)
      ctx.update((v) => ({ ...v, overlay: null, featureEditor: undefined, message: `Saved ${path}` }))
      return true
    }
    let imported = { content: value['content'] } as Record<string, unknown>
    if (kind === 'import' && value['path']) {
      const file = await ctx.controller.file(String(value['path']), 10)
      imported = file.name.endsWith('.skill')
        ? { data: file.data }
        : { content: Buffer.from(file.data, 'base64').toString('utf8') }
    }
    ctx.update((v) => ({ ...v, busy: true }))
    try {
      const result = await ctx.controller.runtime.execute(
        kind === 'import' ? 'skills.import' : kind === 'attachments' ? 'attachments.update' : `${kind}.save`,
        kind === 'import' ? imported : { value }
      )
      ctx.update((v) => ({
        ...v,
        workspace: v.workspace ? { ...v.workspace, features: result as typeof data } : v.workspace,
        overlay: null,
        featureEditor: undefined,
        focus: kind === 'skills' ? 'feature-skill-create' : 'feature-add',
        ...(kind === 'skills' ? { featureSelection: String(value['name']) } : {}),
      }))
    } finally {
      ctx.update((v) => ({ ...v, busy: false }))
    }
    return true
  }
  if (id.startsWith('feature-field:')) {
    ctx.update((v) => ({ ...v, focus: id }))
    return true
  }
  if (
    id === 'feature-add' ||
    id === 'feature-attachments' ||
    id === 'feature-import' ||
    id.startsWith('feature-edit:')
  ) {
    const kind =
      id === 'feature-import'
        ? 'import'
        : (s.settingsGroup as 'assistants' | 'skills' | 'connectors' | 'attachments')
    const key = id.slice('feature-edit:'.length)
    const value =
      kind === 'attachments'
        ? data.attachments
        : id.startsWith('feature-edit:')
          ? kind === 'assistants'
            ? data.assistants.find((a) => a.id === key)
            : kind === 'connectors'
              ? data.connectors.find((c) => c.id === key)
              : data.skills.find((k) => k.name === key)
          : kind === 'assistants'
            ? { name: '', avatar: '*', instructions: '', parameters: {} }
            : kind === 'connectors'
              ? {
                  name: '',
                  type: 'http',
                  url: '',
                  command: '',
                  args: [],
                  headers: {},
                  env: {},
                  enabled: true,
                  timeout: 30,
                }
              : { name: '', description: '', body: '', enabled: true }
    ctx.update((v) => ({
      ...v,
      featureEditor: featureDraft(kind, {
        ...value,
        ...(kind === 'skills' && id.startsWith('feature-edit:') ? { id: key } : {}),
      }),
      overlay: 'feature-editor',
      focus: `feature-field:${kind === 'attachments' ? 'enabled' : kind === 'import' ? 'path' : 'name'}`,
      scroll: 0,
    }))
    return true
  }
  if (id.startsWith('feature-delete:')) {
    ctx.update((v) => ({
      ...v,
      overlay: 'feature-delete',
      edit: id.slice(15),
      focus: 'feature-confirm-delete',
    }))
    return true
  }
  const [action, key] = id.slice(8).split(':')
  let op = '',
    input: Record<string, unknown> = { id: key }
  if (id === 'feature-confirm-delete') {
    op = `${s.settingsGroup}.remove`
    input = { id: s.edit }
  } else if (action === 'default') op = 'assistants.default'
  else if (action === 'toggle') {
    op = 'skills.toggle'
    input['enabled'] = !data.skills.find((k) => k.name === key)?.enabled
  } else if (action === 'connect') op = 'connectors.check'
  else if (action === 'export') {
    ctx.update((v) => ({
      ...v,
      overlay: 'feature-editor',
      featureEditor: featureDraft('export', { id: key, path: `${key}.skill` }),
      focus: 'feature-field:path',
    }))
    return true
  }
  if (op) {
    ctx.update((v) => ({ ...v, busy: true }))
    try {
      await ctx.controller.runtime.execute(op, input)
      const next = (await ctx.controller.runtime.execute('features.get')) as typeof data
      ctx.update((v) => ({
        ...v,
        workspace: v.workspace ? { ...v.workspace, features: next } : v.workspace,
        overlay: null,
        featureEditor: undefined,
        focus:
          action === 'toggle'
            ? id
            : s.settingsGroup === 'skills'
              ? 'feature-skill-create'
              : s.settingsGroup === 'assistants'
                ? 'feature-assistant-default'
                : 'feature-add',
      }))
    } finally {
      ctx.update((v) => ({ ...v, busy: false }))
    }
  }
  return true
}
export function featureInput(input: string, key: Key, s: WorkspaceState): InputResult | undefined {
  const profile = profileInput(key, s)
  if (profile) return profile
  if (
    s.overlay &&
    s.featureEditor &&
    ['skill-menu', 'skill-create-menu', 'assistant-default'].includes(s.featureEditor.kind)
  )
    return
  if (
    s.featureEditor &&
    ['connector-menu', 'connector-tools', 'connector-oauth'].includes(s.featureEditor.kind)
  )
    return
  if (s.overlay === 'feature-editor' && s.featureEditor && (key.tab || key.upArrow || key.downArrow)) {
    const ids = [
      ...featureFields(s.featureEditor).map(([key]) => `feature-field:${key}`),
      'feature-save',
      'close',
    ]
    const index = ids.indexOf(s.focus),
      delta = key.upArrow || key.shift ? -1 : 1
    return { patch: { focus: ids[(index + delta + ids.length) % ids.length]!, hover: '' } }
  }
  if (
    s.overlay !== 'feature-editor' ||
    !s.featureEditor ||
    !s.focus.startsWith('feature-field:') ||
    key.tab ||
    key.escape ||
    key.upArrow ||
    key.downArrow
  )
    return
  if (s.featureEditor.kind === 'skills' && s.featureEditor.value['id'] && s.focus === 'feature-field:name')
    return {}
  const name = s.focus.slice(14),
    value = s.featureEditor.value[name] ?? ''
  if (key.return && !key.shift && !key.meta) return { action: 'feature-save' }
  let next = value
  if (key.backspace || key.delete) next = [...value].slice(0, -1).join('')
  else if (key.ctrl && input === 'u') next = ''
  else if (key.return && (key.shift || key.meta)) next += '\n'
  else if (input && !key.ctrl && !key.meta) next += input.replace(/\r/g, '\n')
  else return
  return {
    patch: { featureEditor: { ...s.featureEditor, value: { ...s.featureEditor.value, [name]: next } } },
  }
}
