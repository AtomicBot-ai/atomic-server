import { drawCompactStatus } from './compact-status.js'
import { floatingDownloadBounds } from './download-layout.js'
import { dimBackdrop } from './draw/backdrop.js'
import { drawConfigChoice } from './server/settings-panel.js'
import { drawFloatingDownloads } from './floating-downloads.js'
import { atomicHeader, brandHeaderRows, workspaceHeaderRows } from './draw/brand-header.js'
import { brandStatus } from './draw/brand-mark.js'
import { shellLayout } from './shell-layout.js'
import { drawServerChoice } from './server/server-settings.js'
import { messageText } from '../../terminal-service/index.js'
import { drawFirstRun } from './setup/first-run.js'
import { drawRail, drawSidebar, serverRunning } from './sidebar.js'
import { drawFooter } from './footer.js'
import { drawSetup } from './setup/setup-panel.js'
import { drawDataPanel } from './data-panels.js'
import type { OrnamentStyle } from './draw/art.js'
import { button, canvas, COLORS, text, wrap } from './draw/canvas.js'
import type { Canvas } from './draw/canvas.js'
import { workspaceLayout } from './draw/layout.js'
import type { WorkspaceState } from './state.js'
import { drawPanels } from './panels.js'
import { drawOverlay } from './overlay.js'
import { COMPOSER_HEIGHT, drawComposer } from './chat/composer.js'
import { newChatButton } from './chat/chat-navigation.js'
import { drawPicker, isPicker } from './chat/picker.js'
export function workspaceFrame(
  s: WorkspaceState,
  width: number,
  height: number,
  seconds: number,
  _ornament: OrnamentStyle = 'fangs',
  downloadHighlight = false
): Canvas {
  const c = canvas(width, height),
    l = workspaceLayout(width, height)
  const downloads = floatingDownloadBounds(c, s)
  c.contentTop = Math.max(brandHeaderRows(width, height), downloads ? downloads.y + downloads.height + 1 : 0)
  const focus = s.hover || s.focus
  if (width < 54 || height < 20) {
    text(c, 1, 1, 'ATOMIC SERVER', COLORS.gold, width - 2, undefined, true)
    wrap('Expand to at least 54 columns and 20 rows. Ctrl+Q closes the console.', width - 2).forEach((r, i) =>
      text(c, 1, 3 + i, r)
    )
    return c
  }
  const onboarding = s.page === 'welcome' || s.page === 'setup'
  const shell = shellLayout(width, height, workspaceHeaderRows(c))
  atomicHeader(
    c,
    brandStatus(s.workspace?.eye),
    seconds,
    s.motion,
    downloads?.y === 1 ? downloads.x - 2 : width
  )
  const x = onboarding ? l.inset : shell.x,
    bodyWidth = onboarding ? width - l.inset * 2 : shell.width
  let y = onboarding ? workspaceHeaderRows(c) : shell.y
  if (!onboarding) {
    drawRail(c, s, shell.bottom, focus)
    if (shell.sidebar) drawSidebar(c, s, shell.rail + 1, shell.y, shell.bottom, focus, s.motion ? seconds : 0)
    else {
      button(c, 'section-menu', x, y, 'Sections ▾', 'Choose a section', focus)
      if (!s.busy)
        button(
          c,
          'api-toggle',
          x + 14,
          y,
          serverRunning(s) ? 'Stop' : 'Start',
          'Start or stop the server',
          focus
        )
      y += 2
    }
  }
  if (s.page === 'welcome') {
    drawFirstRun(c, s, focus, s.motion ? seconds : 0)
  } else if (s.page === 'setup' || (s.page === 'models' && s.setup)) {
    drawSetup(c, s, x, y, bodyWidth, l.bottom, focus, seconds)
  } else if (drawDataPanel(c, s, x, y, bodyWidth, l.bottom, focus)) {
    // History and key management share the same responsive content bounds.
  } else if (s.page === 'chat') {
    button(c, 'chat-parameters', x + bodyWidth - 5, shell.y, '[=]', 'Request parameters', focus)
    if (!shell.sidebar) {
      newChatButton(c, x + bodyWidth - 17, y, 16, focus)
      y++
    } else y += 2
    const composerY = s.messages.length
      ? l.bottom - COMPOSER_HEIGHT + 1
      : Math.min(
          l.bottom - COMPOSER_HEIGHT + 1,
          Math.max(y + 5, Math.floor((y + l.bottom - COMPOSER_HEIGHT) / 2))
        )
    if (!s.messages.length && height >= 24) {
      text(
        c,
        x + Math.max(0, Math.floor((bodyWidth - 25) / 2)),
        composerY - 3,
        'How can I help you today?',
        COLORS.text,
        bodyWidth
      )
    } else if (s.messages.length) {
      const rows = s.messages
        .filter((m) => m.role !== 'system')
        .flatMap((m) => [
          m.role === 'user' ? 'YOU' : 'ATOMIC',
          ...wrap(
            messageText(m.content) || (s.generating ? 'Generating…' : 'No text returned.'),
            bodyWidth - 2
          ),
          '',
        ])
      if (rows.at(-1) === '') rows.pop()
      const available = Math.max(1, composerY - y - 1),
        end = Math.max(available, rows.length - s.scroll)
      rows
        .slice(Math.max(0, end - available), end)
        .forEach((r, i) =>
          text(
            c,
            x,
            y + i,
            r,
            r === 'YOU' ? COLORS.gold : r === 'ATOMIC' ? COLORS.red : COLORS.text,
            bodyWidth
          )
        )
    }
    drawComposer(c, s, x, composerY, bodyWidth, focus, seconds)
  } else if (!drawCompactStatus(c, s, x, y, bodyWidth, focus))
    drawPanels(c, s, { x, y, width: bodyWidth, bottom: l.bottom }, focus)
  if (s.firstRun && s.page === 'models' && !s.setup)
    button(c, 'first-return', x, l.bottom, 'Back to setup', 'Return to onboarding; downloads continue', focus)
  drawFloatingDownloads(c, s, focus, downloadHighlight)
  if (s.overlay) dimBackdrop(c)
  if (s.overlay === 'config-choice') drawConfigChoice(c, s, focus)
  else if (s.overlay === 'server-choice') drawServerChoice(c, s, focus)
  else if (isPicker(s.overlay)) drawPicker(c, s, focus)
  else if (s.overlay) drawOverlay(c, s, focus, seconds)
  if (!s.overlay && (s.message || s.base.busy))
    text(
      c,
      l.inset,
      height - 2,
      s.message || s.base.busy!,
      s.message ? COLORS.gold : COLORS.muted,
      width - l.inset * 2
    )
  drawFooter(c, s, focus)
  // Never register invisible controls on an unusually narrow viewport.
  c.targets = c.targets.filter((t) => t.width > 0 && t.y >= 0 && t.y < height && t.x < width)
  return c
}
