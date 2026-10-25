import type { ChatMessage } from '../../../terminal-service/index.js'
import type { WorkspaceFeatures } from '../../../contract/index.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceState } from '../state.js'
import type { Canvas } from '../draw/canvas.js'
import { button, COLORS, text, wrap } from '../draw/canvas.js'
import { panel, actionButton } from '../draw/cards.js'
import { connectorToolBindings } from '../../../workspace-view/index.js'
import { featureData } from '../server/feature-model.js'
import { chatParametersAction } from './parameters.js'
export function chatFeatureRequest(s: WorkspaceState) {
  const p = s.chatPreferences ?? s.conversation?.request_settings ?? {},
    bindings = connectorToolBindings(
      s.workspace?.features,
      Array.isArray(p['atomic_connectors']) ? (p['atomic_connectors'] as string[]) : []
    )
  const { tools: stored, ...clean } = p
  const manual = Array.isArray(stored)
    ? stored.filter((tool: { function?: { name?: string } }) => !tool.function?.name?.startsWith('mcp_'))
    : []
  const tools = [...manual, ...bindings.map((b) => b.definition)]
  return { ...clean, ...(tools.length ? { tools } : {}) }
}
export async function chatFeatureAction(id: string, ctx: ActionContext) {
  if (await chatParametersAction(id, ctx)) return true
  const s = ctx.get(),
    data = featureData(s),
    prefs = { ...(s.chatPreferences ?? s.conversation?.request_settings ?? {}) }
  if (id === 'chat-features') {
    ctx.update((v) => ({
      ...v,
      overlay: 'chat-features',
      focus: `chat-assistant:${prefs['atomic_assistant'] ?? data.default_assistant}`,
    }))
    return true
  }
  if (id.startsWith('chat-assistant:')) {
    prefs['atomic_assistant'] = id.slice(15)
    ctx.update((v) => ({ ...v, chatPreferences: prefs }))
    return true
  }
  if (id.startsWith('chat-skill:') || id.startsWith('chat-connector:')) {
    const skill = id.startsWith('chat-skill:'),
      key = skill ? 'atomic_skills' : 'atomic_connectors',
      value = id.slice(skill ? 11 : 15)
    const list = Array.isArray(prefs[key]) ? (prefs[key] as string[]) : []
    if (!skill && !list.includes(value) && data.connector_status[value]?.state !== 'connected') {
      await ctx.controller.runtime.execute('connectors.check', { id: value })
      const features = (await ctx.controller.runtime.read('features.get')) as WorkspaceFeatures
      ctx.update((v) => ({ ...v, workspace: v.workspace ? { ...v.workspace, features } : v.workspace }))
    }
    prefs[key] = list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
    ctx.update((v) => ({ ...v, chatPreferences: prefs }))
    return true
  }
  if (
    id === 'chat-tools-approve' ||
    id === 'chat-tools-deny' ||
    (id === 'close' && s.overlay === 'chat-tools')
  ) {
    const calls = pendingToolCalls(s.messages),
      bindings = connectorToolBindings(
        data,
        Array.isArray(prefs['atomic_connectors']) ? (prefs['atomic_connectors'] as string[]) : []
      )
    if (s.busy) return true
    ctx.update((v) => ({ ...v, busy: true }))
    try {
      for (const call of calls) {
        const binding = bindings.find((b) => b.name === call.function.name)
        let content = 'Tool call declined by the user.'
        if (id === 'chat-tools-approve') {
          try {
            if (!binding) throw new Error('This tool is no longer enabled. Reconnect it before using it.')
            const args = JSON.parse(call.function.arguments)
            content = JSON.stringify(
              await ctx.controller.runtime.execute('connectors.call', {
                id: binding.id,
                tool: binding.tool,
                arguments: args,
              })
            )
          } catch (error) {
            content = JSON.stringify({
              isError: true,
              message: error instanceof Error ? error.message : String(error),
            })
          }
        }
        ctx.update((v) => ({
          ...v,
          messages: [...v.messages, { role: 'tool', tool_call_id: call.id, content }],
        }))
      }
      ctx.update((v) => ({ ...v, overlay: null, focus: 'composer' }))
      if (id !== 'close') ctx.send()
    } finally {
      ctx.update((v) => ({ ...v, busy: false }))
    }
    return true
  }
  return false
}
export function drawChatFeatures(c: Canvas, s: WorkspaceState, focus: string) {
  if (s.overlay !== 'chat-features' && s.overlay !== 'chat-tools') return false
  const data = featureData(s),
    p = s.chatPreferences ?? s.conversation?.request_settings ?? {},
    w = Math.min(76, c.width - 8),
    h = Math.min(c.height - 6, 24),
    x = Math.floor((c.width - w) / 2),
    y = Math.floor((c.height - h) / 2)
  c.targets = []
  c.popover = { x, y, width: w, height: h }
  for (let i = y; i < y + h; i++) text(c, x, i, ' '.repeat(w), COLORS.text, w, COLORS.surface)
  panel(c, x, y, w, h)
  if (s.overlay === 'chat-tools') {
    text(c, x + 2, y + 2, 'Run connector tools?', COLORS.text, w - 4, undefined, true)
    const calls = pendingToolCalls(s.messages)
    let row = y + 4
    for (const call of calls) {
      for (const line of wrap(`${call.function.name}\n${call.function.arguments}`, w - 4)) {
        if (row < y + h - 5) text(c, x + 2, row++, line, COLORS.muted, w - 4)
      }
    }
    button(c, 'chat-tools-deny', x + 2, y + h - 3, 'Decline', 'Decline tool calls', focus)
    actionButton(c, 'chat-tools-approve', x + w - 23, y + h - 4, 'Approve & run', 'Run these tools', focus)
    return true
  }
  text(c, x + 2, y + 1, 'Assistant, skills & tools', COLORS.text, w - 4, undefined, true)
  const list: [string, string][] = [
    ['', 'Assistant'],
    ...data.assistants.map(
      (a) =>
        [
          `chat-assistant:${a.id}`,
          `${(p['atomic_assistant'] ?? data.default_assistant) === a.id ? '(o)' : '( )'} ${a.name}`,
        ] as [string, string]
    ),
    ['chat-assistant:none', `${p['atomic_assistant'] === 'none' ? '(o)' : '( )'} No assistant`],
    ['', 'Skills'],
    ...data.skills
      .filter((k) => k.enabled)
      .map(
        (k) =>
          [
            `chat-skill:${k.name}`,
            `${(p['atomic_skills'] as string[] | undefined)?.includes(k.name) ? '[x]' : '[ ]'} ${k.name}`,
          ] as [string, string]
      ),
    ['', 'MCP connectors'],
    ...data.connectors
      .filter((k) => k.enabled)
      .map(
        (k) =>
          [
            `chat-connector:${k.id}`,
            `${(p['atomic_connectors'] as string[] | undefined)?.includes(k.id) ? '[x]' : '[ ]'} ${k.name}`,
          ] as [string, string]
      ),
  ]
  const at = list.findIndex(([id]) => id === focus),
    offset = Math.max(0, at - (h - 7))
  list
    .slice(offset, offset + h - 6)
    .forEach(([id, label], i) =>
      id
        ? button(c, id, x + 2, y + 3 + i, label, label, focus)
        : text(c, x + 2, y + 3 + i, label, COLORS.muted, w - 4)
    )
  button(c, 'close', x + w - 12, y + h - 3, 'Done', 'Close', focus)
  return true
}

export function pendingToolCalls(messages: ChatMessage[]) {
  const last = messages.findLastIndex((m) => m.role === 'assistant' && m.tool_calls?.length)
  const answered = new Set(
    messages
      .slice(last + 1)
      .filter((m) => m.role === 'tool')
      .map((m) => m.tool_call_id)
  )
  return (messages[last]?.tool_calls ?? []).filter((call) => !answered.has(call.id))
}
