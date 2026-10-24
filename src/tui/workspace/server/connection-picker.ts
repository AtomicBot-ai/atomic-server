import { dimBackdrop } from '../draw/backdrop.js'
import { engineName } from '../../../terminal-setup/index.js'
import type { Key } from 'ink'
import type { ActionContext } from '../actions.js'
import type { WorkspaceState } from '../state.js'
import type { InputResult } from '../input.js'
import type { Canvas } from '../draw/canvas.js'
import { button, COLORS, text } from '../draw/canvas.js'
import { panel } from '../draw/cards.js'
import { computeRowWindow } from '../../row-window.js'
import { mouseReport } from '../mouse-report.js'
import { agentChoiceInput } from './connection-agent-list.js'
import { connectionModelState } from '../../../workspace-view/index.js'
const isPicker = (s: WorkspaceState) => ['connection-model', 'connection-engine'].includes(s.overlay ?? '')
const field = (s: WorkspaceState) => (s.overlay === 'connection-engine' ? 'engine' : 'model')
export function connectionChoices(s: WorkspaceState) {
  const d = s.connection
  if (!d) return []
  const selected = connectionModelState(
    d.model,
    s.installed,
    s.workspace?.setups ?? [],
    s.workspace?.downloads ?? [],
    d.provider
  )
  return field(s) === 'model'
    ? [
        ...(!selected.ready && d.model
          ? [{ value: d.model, label: `${d.model} · Not downloaded`, selected: true }]
          : []),
        ...s.installed.map((m) => ({ value: m.id, label: m.name || m.id, selected: m.id === d.model })),
      ]
    : selected.providers.map((provider) => ({
        value: provider,
        label: engineName(provider),
        selected: provider === selected.provider,
      }))
}
const optionId = (value: string) => `connection-option:${encodeURIComponent(value)}`
export function connectionPickerAction(id: string, ctx: ActionContext): boolean {
  const s = ctx.get(),
    d = s.connection
  if (!d) return false
  if (id === 'close' && isPicker(s)) {
    ctx.update((v) => ({ ...v, overlay: 'connection-guide', focus: `guide-${field(s)}`, hover: '' }))
    return true
  }
  if ((id === 'guide-model' || id === 'guide-engine') && d.step === 'review') {
    const next: WorkspaceState = {
      ...s,
      overlay: id === 'guide-model' ? 'connection-model' : 'connection-engine',
    }
    const choices = connectionChoices(next),
      selected = choices.find((c) => c.selected) ?? choices[0]
    ctx.update((v) => ({
      ...v,
      overlay: next.overlay,
      focus: selected ? optionId(selected.value) : 'close',
      hover: '',
    }))
    return true
  }
  if (!id.startsWith('connection-option:') || !isPicker(s)) return false
  const choice = connectionChoices(s).find((c) => optionId(c.value) === id)
  if (!choice) return true
  const selected = connectionModelState(
    choice.value,
    s.installed,
    s.workspace?.setups ?? [],
    s.workspace?.downloads ?? [],
    d.provider
  )
  ctx.update((v) => ({
    ...v,
    connection: v.connection
      ? {
          ...v.connection,
          ...(field(s) === 'model'
            ? {
                model: choice.value,
                provider: selected.provider,
              }
            : { provider: choice.value }),
          error: '',
        }
      : null,
    overlay: 'connection-guide',
    focus: `guide-${field(s)}`,
    hover: '',
  }))
  return true
}
export function connectionGuideInput(
  input: string,
  key: Key,
  s: WorkspaceState,
  frame: Canvas
): InputResult | null {
  if (!isPicker(s)) return agentChoiceInput(input, key, s, frame)
  const mouse = mouseReport(input),
    wheel = mouse && s.mouse && mouse.code & 64
  if (!(
    wheel ||
    key.upArrow ||
    key.downArrow ||
    key.tab ||
    key.pageUp ||
    key.pageDown ||
    key.home ||
    key.end
  ))
    return null
  const choices = connectionChoices(s),
    at = choices.findIndex((c) => optionId(c.value) === s.focus)
  const direction =
    key.upArrow || key.pageUp || (key.tab && key.shift) || (wheel && !(mouse.code & 1)) ? -1 : 1
  const delta = key.pageUp || key.pageDown ? Math.max(1, frame.height - 10) : 1
  const next = key.home
    ? 0
    : key.end
      ? choices.length - 1
      : Math.max(0, Math.min(choices.length - 1, at + direction * delta))
  return { patch: { focus: choices[next] ? optionId(choices[next]!.value) : 'close', hover: '' } }
}
export function drawConnectionPicker(c: Canvas, s: WorkspaceState, focus: string) {
  const anchor = c.targets.find((target) => target.id === `guide-${field(s)}`)
  dimBackdrop(c)
  const choices = connectionChoices(s),
    width = Math.min(64, c.width - 8)
  const capacity = Math.max(1, c.height - 11),
    height = Math.max(6, Math.min(choices.length, capacity) + 4)
  const x = Math.max(4, Math.min(anchor?.x ?? Math.floor((c.width - width) / 2), c.width - width - 4))
  const below = (anchor?.y ?? 3) + 1,
    above = (anchor?.y ?? 3) - height
  const y =
    below + height <= c.height - 3
      ? below
      : above >= 2
        ? above
        : Math.max(2, Math.floor((c.height - 3 - height) / 2))
  panel(c, x, y, width, height, true)
  c.popover = { x, y, width, height }
  c.targets = []
  text(
    c,
    x + 2,
    y + 1,
    field(s) === 'model' ? 'Choose model' : 'Choose inference engine',
    COLORS.text,
    width - 4,
    undefined,
    true
  )
  const at = Math.max(
    0,
    choices.findIndex((choice) => optionId(choice.value) === focus)
  )
  const win = computeRowWindow(choices.length, at, capacity)
  choices
    .slice(win.start, win.start + win.count)
    .forEach((choice, i) =>
      button(
        c,
        optionId(choice.value),
        x + 2,
        y + 3 + i,
        `${choice.selected ? '(*)' : '( )'} ${choice.label}`.slice(0, width - 6),
        choice.label,
        focus
      )
    )
  if (!choices.length) {
    if (field(s) === 'model')
      button(
        c,
        'guide-models',
        x + 2,
        y + 3,
        'Choose a local model',
        'Open the model catalog for this connection',
        focus
      )
    else text(c, x + 2, y + 3, 'Choose a downloaded model first.', COLORS.muted, width - 4)
  }
}
