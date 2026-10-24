import { card } from '../draw/cards.js'
import { button, COLORS, text, wrap } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import type { SetupView } from '../../../terminal-setup/index.js'
import { computeRowWindow } from '../../row-window.js'
import { engineFamily, engineName } from '../../../workspace-view/index.js'
/** No catalogs and an error: the check itself failed (say, the server did not start), not every engine. */
export function engineCheckFailed(v: SetupView): boolean {
  return v.stage === 'engine' && !v.busy && !v.catalogs.length && v.error !== ''
}
/** What each llama.cpp engine is for: descriptions only; which engines exist is the core's answer. */
const LLAMA: Readonly<Record<string, string>> = {
  'llamacpp-upstream': 'Standard GGUF models',
  'llamacpp': 'Atomic Chat’s TurboQuant engine',
  'atomic-prism': 'Bonsai models',
}
export function drawSetupBrowser(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  const v = s.setup!
  const put = (row: number, value: string, color: string = COLORS.muted) => {
    if (y + row < bottom - 1) text(c, x, y + row, value, color, width)
  }
  const b = (id: string, row: number, label: string, hint: string, selected = false) =>
    button(c, id, x, y + row, label.slice(0, width - 2), hint, focus, selected)
  if (engineCheckFailed(v)) {
    put(3, 'Engines could not be checked.', COLORS.text)
    let row = 5
    for (const [i, line] of v.error.split('\n').entries())
      for (const part of wrap(line, width)) put(row++, part, i === 0 ? COLORS.red : COLORS.text)
    put(row + 1, 'Fix the cause above, then choose Refresh.')
    button(c, 'setup-refresh', x, bottom, 'Refresh', 'Retry live engine detection.', focus)
    return
  }
  if (v.stage === 'engine') {
    put(3, v.busy ? 'Finding compatible builds...' : 'Choose your inference engine.', COLORS.text)
    let row = 5
    // The core's engines when it answered; llama.cpp's three until then.
    const registered = v.registered.length ? v.registered : Object.keys(LLAMA)
    for (const provider of registered.filter((e) => engineFamily(e) === 'llamacpp')) {
      const name = engineName(provider),
        detail = LLAMA[provider] ?? 'GGUF models'
      const catalog = v.catalogs.find((cat) => cat.provider === provider)
      const build =
        catalog?.available.find((p) => `${p.version}/${p.backend}` === catalog.recommended) ??
        catalog?.available[0]
      if (build) {
        const value = `${provider}|${build.version}|${build.backend}`
        b(
          `setup-engine:${value}`,
          row++,
          name,
          `${detail}. ${build.version} / ${build.backend}. Enter confirms and continues.`
        )
        const target = c.targets.at(-1)!
        for (let col = target.x; col < target.x + target.width; col++) {
          const cell = c.cells[target.y]![col]!
          cell.color = focus === target.id ? COLORS.ground : COLORS.text
          cell.background = focus === target.id ? COLORS.text : COLORS.surface
        }
        if (bottom - y >= 17) put(row++, `    ${build.version} / ${build.backend}  •  Recommended`)
      } else put(row++, `${name}  /  ${v.busy ? 'Checking...' : 'No compatible build available'}`)
    }
    for (const engine of registered.filter((e) => ['managed', 'foundry'].includes(engineFamily(e))))
      b(
        `setup-engine:${engine}`,
        row++,
        `${engineName(engine)}${v.installed.includes(engine) ? '' : '  /  not installed'}`,
        v.installed.includes(engine)
          ? 'Installed. Enter chooses a model for it.'
          : 'Not installed. Enter installs it here first, then you choose a model.'
      )
    if (y + row < bottom - 1)
      b(
        'setup-engine-info',
        row + (bottom - y >= 17 ? 1 : 0),
        'Other engines & workloads',
        'Open the full engine and model catalog | Continue setup manually'
      )
    button(c, 'setup-refresh', x, bottom, 'Refresh', 'Retry live engine detection.', focus)
    if (v.engine)
      button(
        c,
        'setup-models',
        x + 11,
        bottom,
        'Choose models >',
        'Browse Atomic Chat’s model catalog.',
        focus
      )
    return
  }
  if (v.repository) {
    button(c, 'setup-back', x, y + 3, '< Models', 'Return to the model list', focus)
    text(c, x + 12, y + 3, v.repository, COLORS.muted, width - 12)
  } else {
    const used = button(
      c,
      'setup-query',
      x,
      y + 3,
      v.query ? `Search: ${v.query.slice(0, 18)}` : 'Search models',
      'Search model catalog',
      focus
    )
    button(c, 'setup-engine-back', x + used + 1, y + 3, 'Engine v', 'Choose inference engine', focus)
    if (v.query) button(c, 'setup-catalog', x + used + 13, y + 3, 'Clear', 'Clear search', focus)
  }
  let installedRows = 0
  if ((s.firstRun || s.connection?.pickingModel) && !v.repository && s.installed.length) {
    const installedWindow = computeRowWindow(
      s.installed.length,
      focus.startsWith('first-installed:') ? Number(focus.slice(16)) : 0,
      2
    )
    for (const [i, model] of s.installed
      .slice(installedWindow.start, installedWindow.start + installedWindow.count)
      .entries()) {
      b(
        `first-installed:${installedWindow.start + i}`,
        5 + i,
        `${model.name || model.id} · Installed`,
        'Use this downloaded model and continue setup'
      )
      installedRows++
    }
  }
  const items = v.repository ? v.files : v.repositories
  const cardHeight = 3
  const win = computeRowWindow(
    items.length,
    s.selected,
    Math.max(1, Math.floor((bottom - y - 6 - installedRows) / cardHeight))
  )
  items.slice(win.start, win.start + win.count).forEach((item, i) => {
    const index = win.start + i
    if ('filename' in item) {
      const size =
        item.size >= 1024 ** 3
          ? `${(item.size / 1024 ** 3).toFixed(1)} GB`
          : `${(item.size / 1024 ** 2).toFixed(0)} MB`
      const recommended = /Q4_K_M/i.test(item.filename) ? ' *' : ''
      card(c, {
        id: `setup-file:${index}`,
        x,
        y: y + 5 + i * cardHeight + installedRows,
        width,
        height: cardHeight,
        title: `${size}  ${item.filename}${recommended}`,
        focus,
        detail: 'Download this version',
        icon: '[v]',
      })
    } else {
      card(c, {
        id: `setup-repo:${index}`,
        x,
        y: y + 5 + i * cardHeight + installedRows,
        width,
        height: cardHeight,
        title: (item.title ?? item.id).slice(0, Math.max(4, width - 21)),
        detail: item.summary ?? 'Download recommended version',
        icon: '[M]',
        focus,
      })
      button(
        c,
        `setup-variants:${index}`,
        x + width - 14,
        y + 6 + i * cardHeight + installedRows,
        'Versions v',
        'Choose a download version',
        focus
      )
    }
  })
  if (v.busy && !items.length)
    put(6, v.repository ? 'Reading available downloads...' : 'Updating model catalog...')
  else if (!items.length) put(6, 'No models found. Try another search or return to Staff picks.')
}
