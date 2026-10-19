import { downloadRows } from '../../workspace-view/index.js'
import { operationFields } from './operations/operation-model.js'
import type { Key } from 'ink'
import type { Canvas } from './draw/canvas.js'
import { graphemes, hit } from './draw/canvas.js'
import type { WorkspaceState } from './state.js'
import { PAGES } from './state.js'
import { isPicker, pickerRows } from './chat/picker.js'
export interface InputResult {
  patch?: Partial<WorkspaceState>
  action?: string | undefined
  quit?: true
  leader?: boolean
}
/** SGR reports are recognized before editor input; their bytes can never become chat text. */
export function mouseReport(
  input: string
): { code: number; x: number; y: number; released: boolean } | undefined {
  // eslint-disable-next-line no-control-regex
  const m = /^(?:\u001b)?\[<(\d+);(\d+);(\d+)([Mm])$/.exec(input)
  return m
    ? { code: Number(m[1]), x: Number(m[2]) - 1, y: Number(m[3]) - 1, released: m[4] === 'm' }
    : undefined
}
export function workspaceInput(
  input: string,
  key: Key,
  s: WorkspaceState,
  frame: Canvas,
  leader = false
): InputResult {
  // Legacy xterm modified-Enter encodings complement Ink's CSI-u/Kitty parser.
  // eslint-disable-next-line no-control-regex
  if (/^(?:\u001b)?\[(?:27;2;13~|13;2~)$/.test(input)) {
    key = { ...key, return: true, shift: true }
    input = ''
  }
  const mouse = mouseReport(input)
  if (mouse) {
    if (!s.mouse) return {}
    if (mouse.code & 64) {
      if (s.overlay === 'operation-choice') {
        const at = Number(s.focus.replace('operation-choice:', '')) || 0
        return {
          patch: {
            focus: `operation-choice:${Math.max(0, Math.min(s.operationChoices.length - 1, at + (mouse.code & 1 ? 1 : -1)))}`,
            hover: '',
          },
        }
      }
      if (isPicker(s.overlay)) {
        const rows = pickerRows(s),
          at = rows.findIndex((r) => r.id === s.focus)
        return {
          patch: {
            focus: rows[Math.max(0, Math.min(rows.length - 1, at + (mouse.code & 1 ? 1 : -1)))]?.id ?? '',
            hover: '',
          },
        }
      }
      return { action: mouse.code & 1 ? 'scroll-down' : 'scroll-up' }
    }
    if (mouse.released) return {}
    const target = hit(frame, mouse.x, mouse.y)
    if (mouse.code & 32)
      return {
        patch: {
          hover: target?.id ?? '',
          message: '',
          ...(target?.id.startsWith('setup-repo:') ? { selected: Number(target.id.slice(11)) } : {}),
        },
      }
    if ((mouse.code & 3) !== 0) return {}
    if (!target) {
      const p = frame.popover
      return isPicker(s.overlay) &&
        (!p || mouse.x < p.x || mouse.x >= p.x + p.width || mouse.y < p.y || mouse.y >= p.y + p.height)
        ? { action: 'close' }
        : {}
    }
    return { patch: { focus: target.id, hover: '', message: '' }, action: target.id }
  }
  const focused = () => {
    const id = frame.targets.find((t) => t.id === (s.hover || s.focus))?.id ?? frame.targets[0]?.id
    return { action: id, patch: { focus: id ?? '', hover: '' } }
  }
  if (input.startsWith('[<') || input.startsWith('\u001b[<')) return {}
  if (key.meta && ['1', '2', '3'].includes(input))
    return { action: `page:${['chat', 'server', 'models'][Number(input) - 1]}` }
  if (input === '[S' || input === '\u001bOS') return { action: 'console' }
  if (key.ctrl && input === 'q') return { quit: true }
  if (key.ctrl && input === 'x') return { action: 'mouse' }
  if (key.ctrl && input === 'c')
    return { action: s.page === 'setup' ? (s.setup?.preparing ? 'setup-cancel' : 'setup-pause') : 'cancel' }
  if (key.ctrl && input === 'g') return { patch: { overlay: 'menu', focus: 'page:chat' }, leader: true }
  if (key.ctrl && input === 'k') return { patch: { overlay: 'help', focus: 'close' } }
  if (leader) {
    const p = PAGES.find((p) => p.key === input.toLowerCase())
    return p ? { action: `page:${p.id}`, leader: false } : { leader: false }
  }
  if (isPicker(s.overlay) && (key.tab || key.upArrow || key.downArrow || key.pageUp || key.pageDown)) {
    const rows = pickerRows(s),
      at = rows.findIndex((r) => r.id === s.focus)
    const delta = key.upArrow || key.pageUp || (key.tab && key.shift) ? -1 : 1
    return { patch: { focus: rows[(at + delta + rows.length) % rows.length]?.id ?? '', hover: '' } }
  }
  if (s.overlay === 'operation-choice' && (key.upArrow || key.downArrow || key.pageUp || key.pageDown)) {
    const at = Number(s.focus.replace('operation-choice:', '')) || 0
    const delta = key.upArrow || key.pageUp ? -1 : 1
    return {
      patch: {
        focus: `operation-choice:${Math.max(0, Math.min(s.operationChoices.length - 1, at + delta))}`,
        hover: '',
      },
    }
  }
  if (
    s.page === 'tools' &&
    !s.overlay &&
    s.focus.startsWith('operation-field:') &&
    (key.upArrow || key.downArrow)
  ) {
    const op = s.operations.find((v) => v.name === s.operation),
      fields = op ? operationFields(op) : []
    const at = fields.findIndex((v) => `operation-field:${v.path}` === s.focus)
    const next = Math.max(0, Math.min(fields.length - 1, at + (key.upArrow ? -1 : 1)))
    return { patch: { focus: `operation-field:${fields[next]?.path ?? ''}`, selected: next, hover: '' } }
  }
  if (key.tab) {
    const i = frame.targets.findIndex((t) => t.id === s.focus),
      next = (i + (key.shift ? -1 : 1) + frame.targets.length) % frame.targets.length
    return { patch: { focus: frame.targets[next]?.id ?? '', hover: '', message: '' } }
  }
  if (s.overlay === 'console' && s.focus === 'console-input') {
    if (key.return) return { action: 'console-run' }
    if (key.escape) return { action: 'close' }
    if (key.backspace || key.delete)
      return { patch: { consoleInput: graphemes(s.consoleInput).slice(0, -1).join('') } }
    if (key.ctrl && input === 'u') return { patch: { consoleInput: '' } }
    if (input && !key.ctrl && !key.meta)
      return { patch: { consoleInput: s.consoleInput + input.replace(/\n/g, '') } }
  }
  if (s.overlay === 'endpoint') {
    if (key.escape) return { action: 'close' }
    if (key.return) return focused()
    if (key.backspace || key.delete)
      return { patch: { editValue: graphemes(s.editValue).slice(0, -1).join('') } }
    if (key.ctrl && input === 'u') return { patch: { editValue: '' } }
    if (input && !key.ctrl && !key.meta)
      return { patch: { editValue: s.editValue + input.replace(/\r?\n/g, '') } }
  }
  if (s.base.logs.filtering && !s.overlay) {
    if (key.escape || key.return)
      return { patch: { base: { ...s.base, logs: { ...s.base.logs, filtering: false } } } }
    const filter = key.backspace
      ? graphemes(s.base.logs.filter).slice(0, -1).join('')
      : s.base.logs.filter + (!key.ctrl ? input : '')
    return { patch: { base: { ...s.base, logs: { ...s.base.logs, filter } } } }
  }
  if (key.escape && !s.overlay && (s.page === 'setup' || (s.page === 'models' && s.setup))) {
    const stage = s.setup?.stage
    return {
      action: s.setup?.preparing
        ? 'setup-cancel'
        : stage === 'engine'
          ? s.setupComplete
            ? 'library-close'
            : 'setup-intro'
          : stage === 'download' || stage === 'ready'
            ? 'setup-pause'
            : s.setup?.repository
              ? 'setup-back'
              : s.setupComplete
                ? 'library-close'
                : 'setup-engine-back',
    }
  }
  if (key.escape) return s.overlay ? { action: 'close' } : { patch: { overlay: 'menu', focus: 'page:chat' } }
  if (key.ctrl && input === 'p') return { action: 'page:history' }
  if (key.ctrl && input === 'n') return { action: 'new' }
  if (s.overlay === 'command' && (key.pageDown || key.pageUp))
    return { action: key.pageUp ? 'scroll-up' : 'scroll-down' }
  if (s.overlay) {
    if (key.return) return focused()
    if (key.upArrow || key.downArrow) {
      const i = frame.targets.findIndex((t) => t.id === s.focus)
      return {
        patch: {
          hover: '',
          focus:
            frame.targets[(i + (key.upArrow ? -1 : 1) + frame.targets.length) % frame.targets.length]?.id ??
            '',
        },
      }
    }
    return {}
  }
  if (s.page === 'welcome' && !key.ctrl && !key.meta && ['1', '2', '3'].includes(input))
    return { action: input === '1' ? 'hosting' : input === '2' ? 'setup-manual' : 'agent-setup' }
  if ((key.upArrow || key.downArrow) && s.focus.startsWith('history:')) {
    const list = s.history.filter((h) =>
      `${h.title} ${h.model} ${h.workingDirectory}`.toLowerCase().includes(s.historyFilter.toLowerCase())
    )
    const at = list.findIndex((h) => `history:${h.id}` === s.focus),
      selected = Math.max(0, Math.min(list.length - 1, at + (key.upArrow ? -1 : 1)))
    return {
      patch: { selected, focus: list[selected] ? `history:${list[selected]!.id}` : s.focus, hover: '' },
    }
  }
  if (key.pageUp || key.pageDown) return { action: key.pageUp ? 'scroll-up' : 'scroll-down' }
  if (s.page === 'chat' && s.focus === 'composer') {
    const chars = graphemes(s.draft),
      at = Math.min(s.cursor, chars.length)
    if (key.return) {
      if (key.meta || key.shift) {
        chars.splice(at, 0, '\n')
        return { patch: { draft: chars.join(''), cursor: at + 1 } }
      }
      return { action: 'send', patch: { hover: '' } }
    }
    if (key.leftArrow) return { patch: { cursor: Math.max(0, at - 1) } }
    if (key.rightArrow) return { patch: { cursor: Math.min(chars.length, at + 1) } }
    if (key.home || (key.ctrl && input === 'a')) return { patch: { cursor: 0 } }
    if (key.end || (key.ctrl && input === 'e')) return { patch: { cursor: chars.length } }
    if (key.backspace || key.delete) {
      if (at > 0) chars.splice(at - 1, 1)
      return { patch: { draft: chars.join(''), cursor: Math.max(0, at - 1) } }
    }
    if (key.ctrl && input === 'u') return { patch: { draft: '', cursor: 0 } }
    if (input && !key.ctrl && !key.meta) {
      const pasted = graphemes(input.replace(/\r/g, '\n'))
      chars.splice(at, 0, ...pasted)
      return { patch: { draft: chars.join(''), cursor: at + pasted.length, message: '' } }
    }
    return {}
  }
  const listPrefixes = [
    'model:',
    'installed:',
    'request:',
    'command:',
    'setup-repo:',
    'setup-file:',
    'setup-job:',
    'library-row:',
    'download-row:',
  ]
  const prefix = listPrefixes.find((p) => s.focus.startsWith(p))
  if ((key.upArrow || key.downArrow) && prefix) {
    const length =
      prefix === 'download-row:'
        ? downloadRows(s.workspace?.setups ?? [], s.workspace?.downloads ?? []).length
        : prefix === 'library-row:'
          ? s.libraryRows.length
          : prefix === 'model:'
            ? s.models.length
            : prefix === 'installed:'
              ? s.installed.length
              : prefix === 'request:'
                ? s.requests.length
                : prefix === 'command:'
                  ? s.commands.length
                  : prefix === 'setup-repo:'
                    ? (s.setup?.repositories.length ?? 0)
                    : prefix === 'setup-job:'
                      ? (s.setup?.selections.length ?? 0)
                      : (s.setup?.files.length ?? 0)
    const selected = Math.max(
      0,
      Math.min(length - 1, Number(s.focus.slice(prefix.length)) + (key.upArrow ? -1 : 1))
    )
    return { patch: { selected, focus: `${prefix}${selected}`, hover: '' } }
  }
  if (input === ' ' && s.focus.startsWith('setup-file:')) return { action: s.focus }
  if (key.return) return focused()
  if (input === '?') return { patch: { overlay: 'help', focus: 'close' } }
  if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
    const delta = key.upArrow || key.leftArrow ? -1 : 1,
      index = frame.targets.findIndex((t) => t.id === s.focus),
      target = frame.targets[(index + delta + frame.targets.length) % frame.targets.length]
    const selected = target?.id.startsWith('model:')
      ? Number(target.id.slice(6))
      : target?.id.startsWith('request:')
        ? Number(target.id.slice(8))
        : s.selected
    return { patch: { focus: target?.id ?? '', hover: '', message: '', selected } }
  }
  return {}
}
