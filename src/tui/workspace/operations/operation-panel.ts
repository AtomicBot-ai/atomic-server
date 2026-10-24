import { button, text, wrap, COLORS } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { fieldValue, operationFields } from './operation-model.js'
import { computeRowWindow } from '../../row-window.js'
export function drawOperationPanel(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  const op = s.operations.find((v) => v.name === s.operation)
  if (!op && s.toolGroup === 'download') {
    text(c, x, y, 'Transfer details', COLORS.gold, width)
    wrap(s.operationResult, width)
      .slice(s.scroll, s.scroll + Math.max(1, bottom - y - 2))
      .forEach((line, i) => text(c, x, y + 2 + i, line, COLORS.text, width))
    let bx = x
    for (const [id, label] of [
      ['operation-back', 'Back'],
      ['operation-copy', 'Copy'],
      ['operation-up', '↑'],
      ['operation-down', '↓'],
    ])
      bx += button(c, id!, bx, bottom, label!, label!, focus) + 1
    return
  }
  button(
    c,
    'operation-select',
    x,
    y,
    `${op?.title ?? 'Choose an action'} ▾`,
    'Choose a server command',
    focus
  )
  button(c, 'operation-back', x + Math.max(28, width - 12), y, 'Back', 'Return to workspace', focus)
  if (!op) return
  if (op.name === 'api.inspector' || op.effect === 'load' || op.effect === 'interrupt')
    text(c, x, y + 1, op.description, COLORS.muted, width)
  const fields = operationFields(op),
    resultView = s.focus === 'operation-output' || s.edit === 'operation-output'
  const available = Math.max(1, bottom - y - 5)
  if (resultView) {
    const rows = wrap(s.operationResult || 'No result yet.', width)
    rows.slice(s.scroll, s.scroll + available).forEach((v, i) => text(c, x, y + 2 + i, v, COLORS.text, width))
  } else {
    const selected = fields.findIndex((f) => `operation-field:${f.path}` === (focus || s.focus))
    const win = computeRowWindow(fields.length, Math.max(0, selected >= 0 ? selected : s.selected), available)
    fields.slice(win.start, win.start + win.count).forEach((f, i) => {
      const value = fieldValue(s.operationInput, f.path)
      const shown =
        value === undefined
          ? '—'
          : /api_key|token|password/.test(f.path)
            ? '••••••••'
            : typeof value === 'object'
              ? JSON.stringify(value)
              : String(value)
      button(
        c,
        `operation-field:${f.path}`,
        x,
        y + 2 + i,
        `${f.path.replace(/^request\./, '')}${f.required ? ' *' : ''}: ${shown}${f.schema.enum ? ' ▾' : ''}`.slice(
          0,
          width - 2
        ),
        f.schema.description ?? `${f.schema.type}${f.required ? ' | Required' : ' | Optional'}`,
        focus
      )
    })
    if (!fields.length) text(c, x, y + 2, op.description, COLORS.muted, width)
    if (fields.length > available)
      text(
        c,
        x,
        bottom - 2,
        `${win.start + 1}–${Math.min(fields.length, win.start + win.count)} / ${fields.length}`,
        COLORS.stone,
        width
      )
  }
  let bx = x,
    actionRow = width < 50 ? bottom - 1 : bottom
  for (const [id, label, hint] of [
    ['operation-run', s.busy ? 'Running…' : 'Run', op.description],
    ['operation-fields', 'Fields', 'Edit named fields'],
    ['operation-json', 'JSON', 'Edit complete request JSON'],
    ['operation-output', 'Result', 'Read full response'],
    ['operation-copy', 'Copy', 'Copy the result'],
    ['operation-up', '↑', 'Scroll toward beginning'],
    ['operation-down', '↓', 'Scroll toward end'],
  ]) {
    if (bx + label!.length + 2 > x + width) {
      bx = x
      actionRow++
    }
    if (actionRow > bottom) break
    bx += button(c, id!, bx, actionRow, label!, hint!, focus) + 1
  }
}
export function drawOperationOverlay(c: Canvas, s: WorkspaceState, focus: string) {
  if (s.overlay !== 'operation-choice' && s.overlay !== 'console' && s.overlay !== 'agent-setup') return false
  const x = 3,
    y = 3,
    width = c.width - 6,
    height = c.height - 6
  for (let i = y; i < y + height; i++) text(c, x, i, ' '.repeat(width), COLORS.text, width, COLORS.header)
  c.targets = []
  if (s.overlay === 'operation-choice') {
    text(
      c,
      x + 2,
      y + 1,
      s.operationField === 'operation' ? 'Choose an action' : s.operationField.replace(/^request\./, ''),
      COLORS.gold,
      width - 4
    )
    const selected = Math.max(0, Number(focus.replace('operation-choice:', '')) || s.selected)
    const win = computeRowWindow(s.operationChoices.length, selected, height - 6)
    s.operationChoices.slice(win.start, win.start + win.count).forEach((v, i) => {
      const label =
        s.operationField === 'operation' ? (s.operations.find((o) => o.name === v)?.title ?? v) : v
      button(c, `operation-choice:${win.start + i}`, x + 2, y + 3 + i, label.slice(0, width - 6), v, focus)
    })
  } else if (s.overlay === 'console') {
    text(c, x + 2, y + 1, 'Server console', COLORS.gold)
    text(c, x + 2, y + 3, `> ${s.consoleInput}▏`, COLORS.text, width - 4)
    c.targets.push({
      id: 'console-input',
      x: x + 2,
      y: y + 3,
      width: width - 4,
      height: 1,
      hint: 'Operation name followed by JSON | Enter Run',
    })
    text(
      c,
      x + 2,
      y + 5,
      'api.ping   models.load {"provider":"llamacpp-upstream","model_id":"…"}',
      COLORS.stone,
      width - 4
    )
    wrap(s.operationResult, width - 4)
      .slice(s.scroll, s.scroll + height - 10)
      .forEach((v, i) => text(c, x + 2, y + 7 + i, v, COLORS.text, width - 4))
    button(
      c,
      'console-run',
      x + 2,
      y + height - 3,
      'Run',
      'Execute named operation | No shell interpretation',
      focus
    )
    button(c, 'operation-copy', x + 9, y + height - 3, 'Copy result', 'Copy complete output', focus)
  } else {
    text(c, x + 2, y + 1, 'Control from your agent', COLORS.gold)
    const lines = [
      'Commands: atc control list --json',
      'Run: atc control call <operation> --input \'{"field":"value"}\' --json',
      '',
      'MCP server: atc mcp',
      '',
      'Use the same --data-folder for the TUI and agent.',
      'Copy the setup brief into your agent to configure this server.',
    ]
    lines
      .flatMap((line) => wrap(line, width - 4))
      .slice(0, height - 7)
      .forEach((v, i) => text(c, x + 2, y + 3 + i, v, COLORS.text, width - 4))
    button(
      c,
      'copy-agent-brief',
      x + 2,
      y + height - 3,
      'Copy brief',
      'Copy reproducible setup instructions',
      focus
    )
    button(
      c,
      'setup-manual',
      x + 16,
      y + height - 3,
      'Open workspace',
      'Skip guided setup | Install later',
      focus
    )
  }
  button(c, 'close', x + width - 11, y + height - 3, 'Close', 'Esc Close', focus)
  return true
}
