import { drawServer } from './server-panel.js'
import type { Canvas } from './canvas.js'
import { button, COLORS, text, wrap } from './canvas.js'
import type { WorkspaceState } from './state.js'
import { drawReference } from './reference.js'
import { computeRowWindow } from '../row-window.js'
import { visibleLogLines } from '../state.js'
interface Bounds {
  x: number
  y: number
  width: number
  bottom: number
}
export function drawPanels(c: Canvas, s: WorkspaceState, b: Bounds, focus: string): void {
  const { x, y, width, bottom } = b
  if (['server', 'requests', 'access'].includes(s.page)) {
    let bx = x
    if (s.page !== 'server')
      for (const [id, label] of [
        ['server', 'Overview'],
        ['requests', 'Requests'],
        ['access', 'Access'],
      ])
        bx +=
          button(c, `page:${id}`, bx, y, label!, `Open ${label?.toLowerCase()}.`, focus, s.page === id) + 2
    if (s.page === 'server') {
      drawServer(c, s, x, y, width, bottom, focus)
    } else if (s.page === 'requests') {
      text(c, x, y + 2, 'RECENT REQUESTS', COLORS.gold)
      if (!s.requests.length)
        wrap(
          'No requests yet. Calls appear here while the console is connected. Prompt and reply content are not recorded.',
          width
        ).forEach((r, i) => text(c, x, y + 4 + i, r, COLORS.muted, width))
      const win = computeRowWindow(s.requests.length, s.selected, bottom - y - 5)
      s.requests
        .slice(win.start, win.start + win.count)
        .forEach((r, i) =>
          button(
            c,
            `request:${win.start + i}`,
            x,
            y + 4 + i,
            `${r.status.padEnd(5)} ${r.model.slice(0, Math.max(10, width - 26)).padEnd(Math.max(10, width - 26))} ${r.duration === null ? '--' : Math.round(r.duration) + ' ms'}`,
            'Open request details. Up/Down moves through requests.',
            focus,
            win.start + i === s.selected
          )
        )
      button(c, 'refresh', x, bottom, 'Refresh', 'Refresh server status.', focus)
    } else {
      text(c, x, y + 2, 'Connection settings', COLORS.gold)
      const rows = s.base.config.rows.filter(
        (r) => r.path.startsWith('api.') && !['api.cors', 'api.autoStart'].includes(r.path)
      )
      rows
        .slice(0, bottom - y - 4)
        .forEach((r, i) =>
          button(
            c,
            `setting:${r.path}`,
            x,
            y + 4 + i,
            `${r.path.replace('api.', '').padEnd(15)} ${r.value}`.slice(0, width - 2),
            `${r.description}. Changes apply on the next API start.`,
            focus
          )
        )
      button(c, 'page:keys', x, bottom, 'Manage API keys', 'Create and revoke keys for your apps.', focus)
    }
  } else if (s.page === 'models') {
    text(c, x, y, 'Your model library', COLORS.gold)
    text(
      c,
      x,
      y + 2,
      s.modelsError || `Live endpoint / refreshed every 5 seconds / ${s.endpoint}`,
      COLORS.muted,
      width
    )
    const rows = [
      ...s.installed.map((m, i) => ({
        id: `installed:${i}`,
        label: `${s.models.includes(m.id) ? '[loaded]' : '[local] '} ${m.id}`,
        hint: 'Load this installed model and make it available to chat and the API.',
      })),
      ...s.models
        .filter((m) => !s.installed.some((i) => i.id === m))
        .map((m) => ({
          id: `model:${s.models.indexOf(m)}`,
          label: `[remote] ${m}`,
          hint: 'Use this live model in chat.',
        })),
    ]
    const win = computeRowWindow(rows.length, s.selected, Math.max(1, bottom - y - 5))
    rows
      .slice(win.start, win.start + win.count)
      .forEach((r, i) => button(c, r.id, x, y + 4 + i, r.label.slice(0, width - 3), r.hint, focus))
    if (!rows.length)
      text(c, x, y + 4, 'Install a model, or connect an endpoint with models available.', COLORS.muted, width)
    let bx = x
    for (const [id, label, hint] of [
      ['install-models', '+ Add models', 'Browse live models and install them.'],
      ['refresh-models', 'Refresh', 'Refresh installed and served models now.'],
      ['endpoint', 'Connection', 'Change the chat endpoint.'],
    ])
      bx += button(c, id!, bx, bottom, label!, hint!, focus) + 1
  } else if (s.page === 'settings') {
    text(c, x, y, 'Make yourself at home', COLORS.gold)
    let row = y + 2
    for (const [id, label, hint] of [
      ['endpoint', 'Connection', 'Change the chat endpoint.'],
      ['motion', `Eye animation: ${s.motion ? 'On' : 'Off'}`, 'Reduce motion; keep the eye still.'],
      [
        'mouse',
        `Mouse navigation: ${s.mouse ? 'On' : 'Off'}`,
        'Toggle mouse capture. Ctrl+X also switches text-selection mode.',
      ],
      ['switch-mode', 'Starting workspace', 'Choose where Atomic Chat opens next time.'],
      ['page:access', 'API settings', 'Bind address, port, and access policy.'],
      ['page:logs', 'Server logs', 'Follow the server log.'],
      ['page:checks', 'System checks', 'Check installation and configuration.'],
      ['page:commands', 'Command reference', 'Browse the plain commands.'],
    ])
      if (row < bottom) button(c, id!, x, row++, label!, hint!, focus)
  } else if (s.page === 'logs') {
    text(
      c,
      x,
      y,
      s.base.logs.filtering
        ? `Filter: ${s.base.logs.filter}_`
        : `Server log${s.base.logs.filter ? ' / ' + s.base.logs.filter : ''}`,
      COLORS.gold,
      width
    )
    const lines = visibleLogLines(s.base.logs),
      count = Math.max(1, bottom - y - 2),
      end = Math.max(count, lines.length - s.base.logs.scroll)
    lines.slice(Math.max(0, end - count), end).forEach((r, i) => text(c, x, y + 2 + i, r, COLORS.text, width))
    let bx = x
    for (const [id, label, hint] of [
      ['log-filter', 'Filter', 'Filter log lines. Type to filter; Enter applies.'],
      ['log-follow', s.base.logs.follow ? 'Pause' : 'Follow', 'Toggle following new log entries.'],
      ['scroll-up', 'Up', 'Scroll toward older entries.'],
      ['scroll-down', 'Down', 'Scroll toward newer entries.'],
    ])
      bx += button(c, id!, bx, bottom, label!, hint!, focus) + 1
  } else if (s.page === 'checks') {
    text(c, x, y, 'System checks', COLORS.gold)
    const results = s.base.doctor.results ?? []
    if (!results.length)
      text(
        c,
        x,
        y + 2,
        s.base.doctor.running ? 'Checking this machine...' : 'Run checks to inspect the installation.',
        COLORS.muted,
        width
      )
    results
      .slice(0, bottom - y - 3)
      .forEach((r, i) =>
        text(
          c,
          x,
          y + 2 + i,
          `${r.status.toUpperCase().padEnd(5)} ${r.title}: ${r.message}`,
          COLORS.text,
          width
        )
      )
    button(
      c,
      'checks',
      x,
      bottom,
      'Run checks',
      'Run read-only installation and configuration checks.',
      focus
    )
  } else if (s.page === 'commands') drawReference(c, s, b, focus)
}
