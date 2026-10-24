// Lifted from desktop assistant settings and skills split list/detail @ 807b4d9; adapted: terminal columns and focus.
import type { Key } from 'ink'
import type { WorkspaceState } from '../state.js'
import type { Canvas } from '../draw/canvas.js'
import type { InputResult } from '../input-types.js'
import { button, COLORS, text, wrap } from '../draw/canvas.js'
import { panel, actionButton } from '../draw/cards.js'
import { fieldControl, navigationRow, scrollTrack, toggleControl } from '../draw/controls.js'
import { featureData } from './feature-model.js'
export function drawProfiles(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  const data = featureData(s)
  if (s.settingsGroup === 'assistants') {
    text(c, x, y, 'Assistants', COLORS.text, width, undefined, true)
    actionButton(
      c,
      'feature-add',
      x + Math.max(0, width - 21),
      y + 1,
      'Add assistant',
      'Add assistant',
      focus
    )
    text(c, x, y + 5, 'Default assistant', COLORS.text, width)
    fieldControl(
      c,
      'feature-assistant-default',
      x,
      y + 7,
      Math.min(width, 35),
      data.assistants.find((a) => a.id === data.default_assistant)?.name ?? '',
      'Choose the default assistant',
      focus,
      true
    )
    text(c, x, y + 10, 'All assistants', COLORS.text, width, undefined, true)
    const capacity = Math.max(1, Math.floor((bottom - y - 12) / 5)),
      at = data.assistants.findIndex(
        (a) => focus === `feature-edit:${a.id}` || focus === `feature-delete:${a.id}`
      ),
      offset = Math.min(
        at >= 0 ? Math.max(0, at - capacity + 1) : s.scroll,
        Math.max(0, data.assistants.length - capacity)
      )
    data.assistants.slice(offset, offset + capacity).forEach((a, i) => {
      const top = y + 12 + i * 5
      text(
        c,
        x,
        top,
        `[${a.avatar.slice(0, 2) || '*'}] ${a.name}${a.id === data.default_assistant ? ' · Default' : ''}`,
        COLORS.text,
        width - 16,
        COLORS.surface,
        true
      )
      text(c, x + 4, top + 1, a.description, COLORS.muted, width - 20)
      button(c, `feature-edit:${a.id}`, x + width - 17, top, 'Edit', 'Edit assistant', focus)
      if (a.id !== 'atomic-chat')
        button(c, `feature-delete:${a.id}`, x + width - 10, top, 'Delete', 'Delete assistant', focus)
    })
    scrollTrack(c, x + width - 1, y + 12, bottom - y - 12, offset, capacity, data.assistants.length)
    return true
  }
  if (s.settingsGroup !== 'skills') return false
  const selected = data.skills.find((item) => item.name === s.featureSelection) ?? data.skills[0]
  const stacked = width < 64,
    listWidth = stacked ? width : Math.max(27, Math.floor(width * 0.4)),
    listTop = y + 5
  const listBottom = stacked ? y + Math.max(10, Math.floor((bottom - y) * 0.48)) : bottom
  const capacity = Math.max(1, Math.floor((listBottom - listTop) / 4))
  const index = data.skills.findIndex((item) =>
    [
      `feature-select:${item.name}`,
      `feature-toggle:${item.name}`,
      `feature-skill-menu:${item.name}`,
    ].includes(focus)
  )
  const offset = Math.max(0, Math.min(data.skills.length - capacity, index - capacity + 1))
  text(c, x, y, 'Skills', COLORS.text, listWidth, undefined, true)
  actionButton(
    c,
    'feature-skill-create',
    x,
    y + 1,
    'Create new skill v',
    'Write instructions or upload a skill',
    focus
  )
  if (!data.skills.length) text(c, x, listTop, 'No skills installed.', COLORS.muted, listWidth)
  data.skills.slice(offset, offset + capacity).forEach((item, i) => {
    const top = listTop + i * 4
    navigationRow(
      c,
      `feature-select:${item.name}`,
      x,
      top,
      listWidth - 12,
      item.name,
      focus,
      item.name === selected?.name,
      'Show skill instructions'
    )
    text(c, x + 2, top + 1, item.description, COLORS.muted, listWidth - 3)
    toggleControl(
      c,
      `feature-toggle:${item.name}`,
      x + listWidth - 11,
      top,
      item.enabled,
      'Enable skill',
      focus
    )
    button(c, `feature-skill-menu:${item.name}`, x + listWidth - 4, top, '…', 'Skill actions', focus)
  })
  scrollTrack(c, x + listWidth - 1, listTop, listBottom - listTop, offset, capacity, data.skills.length)
  const detailX = stacked ? x : x + listWidth + 2,
    detailY = stacked ? listBottom + 1 : y,
    detailW = stacked ? width : width - listWidth - 2,
    detailH = bottom - detailY
  if (detailH < 5) return true
  panel(c, detailX, detailY, detailW, detailH)
  text(c, detailX + 2, detailY + 1, 'Instructions', COLORS.text, detailW - 4, undefined, true)
  if (selected)
    button(
      c,
      `feature-edit:${selected.name}`,
      detailX + detailW - 9,
      detailY + 1,
      'Edit',
      'Edit skill',
      focus
    )
  const lines = selected ? wrap(selected.body, detailW - 4) : ['Select a skill.'],
    shown = detailH - 4
  lines
    .slice(s.scroll, s.scroll + shown)
    .forEach((line, i) => text(c, detailX + 2, detailY + 3 + i, line, COLORS.text, detailW - 4))
  scrollTrack(c, detailX + detailW - 2, detailY + 3, shown, s.scroll, shown, lines.length)
  return true
}
export function drawProfileMenu(c: Canvas, s: WorkspaceState, focus: string) {
  const editor = s.featureEditor
  if (
    s.overlay !== 'feature-editor' ||
    !editor ||
    !['skill-menu', 'skill-create-menu', 'assistant-default'].includes(editor.kind)
  )
    return false
  const data = featureData(s),
    id = editor.value['id'] ?? ''
  const choices: [string, string][] =
    editor.kind === 'assistant-default'
      ? data.assistants.map((a) => [
          `feature-default:${a.id}`,
          `${a.id === data.default_assistant ? '(o)' : '( )'} ${a.name}`,
        ])
      : editor.kind === 'skill-create-menu'
        ? [
            ['feature-add', 'Write skill instructions'],
            ['feature-import', 'Upload a skill'],
          ]
        : [
            [`feature-try:${id}`, 'Try in chat'],
            [`feature-export:${id}`, 'Download'],
            [`feature-edit:${id}`, 'Edit'],
            [`feature-delete:${id}`, 'Delete'],
          ]
  const w = Math.min(42, c.width - 6),
    h = Math.min(choices.length + 6, c.height - 4),
    x = Math.floor((c.width - w) / 2),
    y = Math.floor((c.height - h) / 2)
  c.targets = []
  c.popover = { x, y, width: w, height: h }
  panel(c, x, y, w, h)
  text(
    c,
    x + 2,
    y + 1,
    editor.kind === 'assistant-default'
      ? 'Default assistant'
      : editor.kind === 'skill-create-menu'
        ? 'Create new skill'
        : id,
    COLORS.text,
    w - 4,
    undefined,
    true
  )
  const offset = Math.max(0, choices.findIndex(([id]) => id === focus) - (h - 6))
  choices
    .slice(offset, offset + h - 5)
    .forEach(([id, label], i) => button(c, id, x + 2, y + 3 + i, label, label, focus))
  button(c, 'close', x + 2, y + h - 2, 'Close', 'Close menu', focus)
  return true
}
export function profileInput(key: Key, s: WorkspaceState): InputResult | undefined {
  if (!key.tab && !key.upArrow && !key.downArrow) return
  if (s.overlay === 'feature-editor' && s.featureEditor?.kind === 'assistant-default') {
    const ids = [...featureData(s).assistants.map((a) => `feature-default:${a.id}`), 'close']
    return {
      patch: {
        focus: ids[(ids.indexOf(s.focus) + (key.upArrow || key.shift ? -1 : 1) + ids.length) % ids.length]!,
        hover: '',
      },
    }
  }
  if (
    s.overlay ||
    !['skills', 'assistants'].includes(s.settingsGroup) ||
    !['access', 'settings'].includes(s.page)
  )
    return
  const skills = featureData(s).skills
  const ids =
    s.settingsGroup === 'assistants'
      ? [
          'feature-add',
          'feature-assistant-default',
          ...featureData(s).assistants.flatMap((a) => [
            `feature-edit:${a.id}`,
            ...(a.id !== 'atomic-chat' ? [`feature-delete:${a.id}`] : []),
          ]),
        ]
      : [
          'feature-skill-create',
          ...skills.flatMap((k) => [
            `feature-select:${k.name}`,
            `feature-toggle:${k.name}`,
            `feature-skill-menu:${k.name}`,
          ]),
          ...(skills.length ? [`feature-edit:${s.featureSelection || skills[0]!.name}`] : []),
        ]
  if (!ids.includes(s.focus)) return
  const current = ids.indexOf(s.focus)
  if (key.tab && ((key.shift && current === 0) || (!key.shift && current === ids.length - 1))) return
  const next = ids[(current + (key.upArrow || key.shift ? -1 : 1) + ids.length) % ids.length]!
  return {
    patch: {
      focus: next,
      hover: '',
      ...(next.startsWith('feature-select:') ? { featureSelection: next.slice(15), scroll: 0 } : {}),
    },
  }
}
