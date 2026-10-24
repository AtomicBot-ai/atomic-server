import { connectionModelState, engineName } from '../../../workspace-view/index.js'
import { PROFILE_AGENTS } from '../../../contract/index.js'
import { serverRunning } from './server-status.js'
import { fieldControl } from '../draw/controls.js'
import { actionButton } from '../draw/cards.js'
import { drawAgentChoices, drawConnectionChoices } from './connection-art.js'
import { button, COLORS, text, wrap, wrapWords } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { workspaceDownloadRows } from '../download-layout.js'
import { drawConnectionHeading } from './connection-heading.js'
import { connectionDialog } from './connection-dialog.js'
import { connectionAgentName } from './connection-guide-actions.js'
export function drawConnectionGuide(c: Canvas, s: WorkspaceState, focus: string, seconds = 0) {
  const d = s.connection
  if (!d) return
  const { x, y: top, width, bottom } = connectionDialog(c, d, workspaceDownloadRows(s).length > 0)
  let y = drawConnectionHeading(c, s, x, top, width, focus)
  const put = (value: string, color: string = COLORS.text) => {
    for (const line of wrap(value, width)) {
      if (y < bottom) text(c, x, y++, line, color, width)
    }
  }
  const b = (id: string, label: string, hint: string) => {
    if (y < bottom) button(c, id, x, y++, label.slice(0, width - 2), hint, focus)
  }
  const name = connectionAgentName(d.agent)
  const launchable =
    d.path === 'agent' &&
    PROFILE_AGENTS.includes(d.agent) &&
    serverRunning(s) &&
    (d.step === 'done' || (s.setupComplete && !s.firstRun))
  if (d.step === 'choose') {
    drawConnectionChoices(c, x, y, width, bottom, focus, s.motion ? seconds : 0)
  } else if (d.step === 'agent') {
    drawAgentChoices(c, d, x, y, width, bottom, focus, s.motion ? seconds : 0)
  } else if (d.step === 'endpoint') {
    put('Access: This device only · 127.0.0.1', COLORS.muted)
    fieldControl(c, 'guide-port', x, y++, width, `Server port: ${d.port}`, 'Edit the port; 1–65535', focus)
    put('Enable network access later from Server configuration.', COLORS.muted)
    actionButton(
      c,
      'guide-next',
      x + width - 14,
      bottom - 2,
      'Continue',
      'Review the endpoint and model',
      focus
    )
  } else if (d.step === 'review') {
    const selected = connectionModelState(
      d.model,
      s.installed,
      s.workspace?.setups ?? [],
      s.workspace?.downloads ?? [],
      d.provider
    )
    const paired = width >= 64,
      fieldWidth = paired ? Math.floor((width - 3) / 2) : width
    const choice = (id: string, label: string, value: string, hint: string, second = false) => {
      if (paired) {
        const fieldX = x + (second ? fieldWidth + 3 : 0)
        text(c, fieldX, y, label, COLORS.muted, fieldWidth)
        fieldControl(c, id, fieldX, y + 1, fieldWidth, value, hint, focus, true)
      } else fieldControl(c, id, x, y++, width, `${label}: ${value}`, hint, focus, true)
    }
    choice(
      'guide-engine',
      'Inference engine',
      selected.provider ? engineName(selected.provider) : 'Choose engine',
      'Choose a compatible inference engine'
    )
    choice('guide-model', 'Model', d.model || 'Choose model', 'Choose a downloaded model', true)
    if (paired) y += 3
    if (!d.model) {
      actionButton(
        c,
        'guide-models',
        x + width - 26,
        y,
        'Choose a local model',
        'Choose a model for this connection',
        focus
      )
      y += 3
    } else b('guide-models', 'Choose a local model', 'Choose a model for this connection')
    const errorLines = d.error ? wrapWords(d.error, width) : []
    // Keep recovery instructions above the action. Optional connection details use only spare rows.
    let detailRows = bottom - 2 - y - errorLines.length
    if (!d.error || detailRows-- > 0)
      put(`http://127.0.0.1:${d.port}${s.workspace?.api.prefix ?? '/v1'}`, COLORS.muted)
    if (s.workspace?.api.running && (!d.error || detailRows-- > 0))
      put('Restart interrupts active requests.', COLORS.muted)
    if (selected.ready && selected.provider)
      actionButton(
        c,
        'guide-configure',
        x + width - (d.error ? 'Retry connection' : 'Configure & start').length - 6,
        bottom - 2,
        d.error ? 'Retry connection' : 'Configure & start',
        'Load, start and verify the model, then prepare connection details',
        focus
      )
    else {
      put(selected.status, COLORS.muted)
      if (selected.waiting)
        b('guide-game', 'Play while waiting', 'Play Minesweeper while the model downloads')
    }
    if (launchable)
      button(
        c,
        `agent:${d.agent}`,
        x,
        bottom - 1,
        'Launch agent',
        'Use the running server in this terminal',
        focus
      )
    if (errorLines.length) {
      const available = Math.max(1, bottom - 2 - y)
      errorLines
        .slice(0, available)
        .forEach((line, i) =>
          text(
            c,
            x,
            y + i,
            i === available - 1 && errorLines.length > available
              ? line.slice(0, width - 1).trimEnd() + '…'
              : line,
            COLORS.red,
            width
          )
        )
    }
  } else if (d.step === 'preparing') put(`${d.status}…`, COLORS.muted)
  else if (d.step === 'done') {
    put(`Model: ${d.model}`)
    put(d.endpoint, COLORS.muted)
    const detail =
      d.command || (d.path === 'agent' ? `In ${name}, enter this endpoint, API key and model ID.` : '')
    const lines = wrap(detail, width),
      count = Math.max(0, bottom - y - (launchable ? 5 : 4))
    lines
      .slice(0, count)
      .forEach((line, i) =>
        put(i === count - 1 && lines.length > count ? line.slice(0, width - 1) + '…' : line, COLORS.muted)
      )
    b('guide-copy', d.command ? 'Copy launch command' : 'Copy endpoint', 'Copy to the terminal clipboard')
    if (launchable) b(`agent:${d.agent}`, 'Launch agent', 'Use the running server in this terminal')
    b('guide-key', 'Copy API key', 'Copy the key without displaying it')
    b('guide-open', 'Connect another tool', 'Return to connection choices')
    actionButton(c, 'guide-close', x + width - 10, bottom - 2, 'Done', 'Open Server connections', focus)
  }
  if (d.error && d.step !== 'review') text(c, x, bottom - 1, d.error, COLORS.red, width)
}
