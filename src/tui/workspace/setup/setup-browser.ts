import { button, COLORS, text } from '../draw/canvas.js'
import type { Canvas } from '../draw/canvas.js'
import type { WorkspaceState } from '../state.js'
import { computeRowWindow } from '../../row-window.js'
const engines = [
  ['llamacpp-upstream', 'llama.cpp', 'Standard GGUF models'],
  ['llamacpp', 'llama.cpp TurboQuant', 'Atomic Chat’s TurboQuant engine'],
  ['atomic-prism', 'Atomic Prism', 'Bonsai models'],
] as const
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
  if (v.stage === 'engine') {
    put(3, v.busy ? 'Finding compatible builds...' : 'Choose your inference engine.', COLORS.text)
    let row = 5
    for (const [provider, name, detail] of engines) {
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
  put(
    3,
    v.repository ? 'Choose a download' : v.query ? `Results for “${v.query}”` : 'Atomic Chat · Staff picks',
    COLORS.gold
  )
  put(
    4,
    v.repository ||
      (v.query ? 'Atomic Chat quants appear first.' : 'Browse first. Search if you need something else.')
  )
  const items = v.repository ? v.files : v.repositories
  const win = computeRowWindow(items.length, s.selected, Math.max(1, bottom - y - 8))
  items.slice(win.start, win.start + win.count).forEach((item, i) => {
    const index = win.start + i
    if ('filename' in item) {
      const size =
        item.size >= 1024 ** 3
          ? `${(item.size / 1024 ** 3).toFixed(1)} GB`
          : `${(item.size / 1024 ** 2).toFixed(0)} MB`
      const recommended = /Q4_K_M/i.test(item.filename) ? ' *' : ''
      b(
        `setup-file:${index}`,
        6 + i,
        `${size}  ${item.filename}${recommended}`,
        `Download ${item.filename}. Engine and required vision files are included. Enter reviews size and compatibility.`
      )
    } else
      b(
        `setup-repo:${index}`,
        6 + i,
        `${/^AtomicChat\//i.test(item.id) ? '◆ ' : '  '}${item.id}`,
        `${item.title ?? item.id}${item.summary ? ' — ' + item.summary : ''}. Enter reviews the recommended version. Versions lets you choose another quant.`
      )
  })
  if (v.busy && !items.length)
    put(6, v.repository ? 'Reading available downloads...' : 'Updating model catalog...')
  else if (!items.length) put(6, 'No models found. Try another search or return to Staff picks.')
  if (items.length)
    put(
      bottom - y - 2,
      `${win.start + 1}–${Math.min(items.length, win.start + win.count)} of ${items.length} | ↑↓ Browse | Enter Review`,
      COLORS.stone
    )
  if (v.repository) {
    button(c, 'setup-back', x, bottom, '< Models', 'Return to the model list. Esc returns to Engines.', focus)
    button(c, 'setup-engine-back', x + 13, bottom, 'Engines', 'Change inference engine.', focus)
  } else {
    button(c, 'setup-engine-back', x, bottom, '< Engine', 'Change inference engine.', focus)
    button(
      c,
      'setup-query',
      x + 13,
      bottom,
      'Search',
      'Search additional models. Matching Atomic Chat quants come first.',
      focus
    )
    if (v.repositories.length)
      button(
        c,
        'setup-variants',
        x + 23,
        bottom,
        'Versions',
        'Choose a quant for the focused model instead of using the recommended download.',
        focus
      )
    if (v.query)
      button(
        c,
        'setup-catalog',
        x + 36,
        bottom,
        'Picks',
        'Return to Atomic Chat’s curated model list.',
        focus
      )
  }
}
