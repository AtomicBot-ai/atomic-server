import { drawChatFeatures } from './chat/features.js'
import { drawFeatureOverlay } from './server/feature-panel.js'
import { drawHelp } from './support.js'
import { SETTING_LABELS } from '../../contract/index.js'
import { drawApiConfirmation } from './server/api-confirmation.js'
import { drawMediaOverlay } from './media/media-overlay.js'
import { drawPermissionDialog } from './setup/access-purpose.js'
import { drawWaitingGame } from './waiting-game.js'
import { drawCatalogMenu } from './library/catalog-menu.js'
import { drawCatalogFilters } from './library/catalog-filters.js'
import { drawDownloadDetail } from './library/download-detail.js'
import { drawCloud } from './library/cloud-view.js'
import { drawConnectionGuide } from './server/connection-guide-view.js'
import { drawConnectionPicker } from './server/connection-picker.js'
import { drawInstallReview } from './library/library-panel.js'
import { drawEnginePanel } from './library/engine-panel.js'
import { drawGoalSetup } from './setup/goal-setup.js'
import { drawOperationOverlay } from './operations/operation-panel.js'
import { sectionMenu } from './navigation.js'
import { AGENTS } from '../../agent-launch/index.js'
import { button, COLORS, text, wrap } from './draw/canvas.js'
import type { Canvas } from './draw/canvas.js'
import type { WorkspaceState } from './state.js'
import { PAGES } from './state.js'
import { helpLines } from '../command-list.js'
import { example } from './actions.js'
import { tooltip } from './draw/tooltip.js'
const ms = (v: number | null) => (v === null ? 'Not available' : `${Math.round(v)} ms`)
export function drawOverlay(c: Canvas, s: WorkspaceState, focus: string, seconds = 0): void {
  c.popover = { x: 3, y: 3, width: c.width - 6, height: c.height - 6 }
  if (drawChatFeatures(c, s, focus)) return
  if (drawFeatureOverlay(c, s, focus)) return
  if (s.overlay === 'help') return drawHelp(c, focus)
  if (s.overlay === 'stop') return drawApiConfirmation(c, s, focus)
  if (drawMediaOverlay(c, s, focus)) return
  if (s.overlay === 'setup-permission') return drawPermissionDialog(c, s, focus)
  if (s.overlay === 'waiting-game') return drawWaitingGame(c, s)
  if (s.overlay === 'connection-model' || s.overlay === 'connection-engine') {
    drawConnectionGuide(c, s, focus, seconds)
    return drawConnectionPicker(c, s, focus)
  }
  if (s.overlay === 'catalog-menu') return drawCatalogMenu(c, s, focus)
  if (s.overlay === 'catalog-filters') return drawCatalogFilters(c, s, focus)
  if (s.overlay === 'download-detail' || s.overlay === 'download-remove')
    return drawDownloadDetail(c, s, focus)
  if (s.overlay === 'cloud') {
    drawCloud(c, s, focus, seconds)
    return
  }
  if (s.overlay === 'connection-guide') {
    drawConnectionGuide(c, s, focus, seconds)
    return
  }
  if (s.overlay === 'setup-goal') {
    drawGoalSetup(c, focus)
    return
  }
  if (s.overlay === 'install-review') {
    drawInstallReview(c, s, focus)
    return
  }
  if (s.overlay === 'engine-panel') {
    drawEnginePanel(c, s, focus)
    return
  }
  if (drawOperationOverlay(c, s, focus)) return
  const cloudEdit = s.overlay === 'endpoint' && s.edit.startsWith('cloud-')
  const w = cloudEdit ? Math.min(64, c.width - 8) : c.width - 6,
    h = cloudEdit ? 13 : c.height - 6,
    x = cloudEdit ? Math.floor((c.width - w) / 2) : 3,
    y = cloudEdit ? Math.floor((c.height - h) / 2) : 3
  for (let r = y; r < y + h; r++) text(c, x, r, ' '.repeat(w), COLORS.text, w, COLORS.header)
  c.popover = { x, y, width: w, height: h }
  c.targets = []
  const put = (row: number, v: string, color: string = COLORS.text) =>
    text(c, x + 2, y + row, v, color, w - 4, COLORS.header)
  const b = (id: string, row: number, label: string, hint: string) =>
    button(c, id, x + 2, y + row, label, hint, focus)
  if (s.overlay === 'sections') {
    const menu = sectionMenu(s)
    put(1, menu.title, COLORS.gold)
    const columns = c.height < 24 && menu.items.length > h - 6 ? 2 : 1
    const rows = Math.ceil(menu.items.length / columns)
    menu.items.forEach((item, i) =>
      button(
        c,
        `${menu.prefix}:${item.id}`,
        x + 2 + Math.floor(i / rows) * Math.floor((w - 4) / columns),
        y + 3 + (i % rows),
        item.label,
        `Open ${item.label}`,
        focus
      )
    )
    b('close', h - 2, 'Close', 'Return to the current section')
    return
  }
  if (s.overlay === 'images') {
    put(2, 'Attachments', COLORS.gold)
    s.images.forEach((image, i) =>
      b(`image-remove:${i}`, 4 + i, `${image.name}  ×`, 'Remove image from this message')
    )
    s.documents?.forEach((doc, i) =>
      b(`document-remove:${i}`, 4 + s.images.length + i, `${doc.name} ×`, 'Remove document')
    )
    b('document-add', h - 5, '+ Document', 'Attach a local text document')
    b('image-add', h - 3, '+ Image', 'Attach an image | Up to five files total; 8 MB per image')
    button(c, 'close', x + 16, y + h - 3, 'Done', 'Return to composer', focus)
    return
  } else if (s.overlay === 'workspace') {
    put(2, 'Atomic Server', COLORS.gold)
    put(4, 'Manage the server, then connect your apps and agents.', COLORS.muted)
    b('hosting', 6, 'Open Server', 'Open API controls and connections.')
  } else if (s.overlay === 'credential') {
    put(2, 'Your API key', COLORS.gold)
    wrap(s.secret || 'Key hidden.', w - 4).forEach((line, i) => put(5 + i, line))
    put(9, 'Shown for one minute. You can reveal it again from API keys.', COLORS.muted)
    b('copy-secret', h - 3, 'Copy key', 'Copy this credential to your terminal clipboard.')
    button(c, 'close', x + 16, y + h - 3, 'Done', 'Hide this key.', focus)
    return
  } else if (s.overlay === 'revoke-key' || s.overlay === 'delete-chat') {
    const key = s.overlay === 'revoke-key'
    put(2, key ? 'Revoke this API key?' : 'Delete this conversation?', COLORS.gold)
    wrap(
      key
        ? 'Apps using this key will lose access on their next request. Other keys continue to work.'
        : 'This removes the saved conversation from this device. It cannot be undone.',
      w - 4
    ).forEach((line, i) => put(4 + i, line))
    b(
      key ? 'revoke-key-confirm' : 'delete-chat-confirm',
      h - 3,
      key ? 'Revoke key' : 'Delete conversation',
      'Confirm this action.'
    )
    button(c, 'close', x + 25, y + h - 3, 'Keep it', 'Cancel without making changes.', focus)
    return
  } else if (s.overlay === 'remove-model') {
    const model = s.installed.find((m) => m.id === s.libraryRemove)
    put(2, `Delete ${s.libraryRemove}?`, COLORS.gold)
    wrap(
      model?.store === 'managed'
        ? `It is in the managed engines' shared store: removing it removes it for every managed engine (${(model.providers ?? []).join(', ')}), loaded or not.`
        : 'Its files will be deleted. Unload the model before deleting it.',
      w - 4
    ).forEach((line, i) => put(4 + i, line))
    b('remove-model-confirm', h - 3, 'Delete model', 'Delete it now.')
    button(c, 'close', x + 20, y + h - 3, 'Keep it', 'Cancel without making changes.', focus)
    return
  } else if (s.overlay === 'menu' && !s.setupComplete) {
    put(2, 'Prepare your workspace first', COLORS.gold)
    put(4, 'Choose an engine and models, then let installation finish.', COLORS.muted)
    tooltip(c, x + 2, y + 6, 'Ctrl+Q Close | Downloads continue in background', w - 4, COLORS.header)
  } else if (s.overlay === 'menu') {
    put(2, 'Go to', COLORS.gold)
    PAGES.forEach((p, i) => b(`page:${p.id}`, 4 + i, `${p.name}  [${p.key}]`, p.hint))
    b('library:downloads', 9, 'Downloads', 'Review background downloads and resume interrupted jobs.')
    b('choose-goal', 10, 'Set up a service', 'Prepare an engine and model for your clients.')
  } else if (s.overlay === 'agent') {
    put(2, `Use with ${AGENTS.find((a) => a.id === s.agent)?.name}`, COLORS.gold)
    put(4, 'Atomic Server provides the model for this session.', COLORS.muted)
    b('agent-model', 6, `Model: ${s.agentModel}`, 'Choose the next available model.')
    put(8, 'Launch switches this terminal to the agent. Exit it to return.', COLORS.muted)
    put(
      10,
      s.agent === 'atomic-agent'
        ? 'Uses a separate server profile for Atomic Agent.'
        : 'Your existing provider settings are preserved.',
      COLORS.muted
    )
    b('launch-agent', h - 3, 'Launch and switch', 'Open the agent with Atomic Server as its model provider.')
    button(c, 'close', x + 25, y + h - 3, 'Cancel', 'Return to Server.', focus)
    return
  } else if (s.overlay === 'command') {
    const row = s.commands[s.selected]
    if (row) {
      put(2, `atc ${row.path.join(' ')}  /  ${row.status}`, COLORS.gold)
      helpLines(row, w - 4)
        .slice(s.scroll, s.scroll + h - 7)
        .forEach((line, i) => put(4 + i, line))
    }
  } else if (s.overlay === 'endpoint') {
    const titles: Record<string, string> = {
      'guide-port': 'Server port',
      'cloud-provider': 'Provider name',
      'cloud-url': 'Base URL',
      'cloud-key': 'API key',
      'cloud-models': 'Model IDs (comma-separated)',
      'setup-query': 'Find a model',
      'library-query': 'Search model catalog',
      'library-import': 'Import a local GGUF file',
      'image-path': 'Attach image',
      'document-path': 'Attach document',
      'media-save': 'Save result to server path',
      'media-source:request.initImage': 'Source image path',
      'media-source:request.maskImage': 'Mask image path',
      'history-search': 'Search your conversations',
      'key-name': 'Name this API key',
      'rename-chat': 'Rename conversation',
    }
    put(
      2,
      titles[s.edit] ??
        (s.edit.startsWith('operation-')
          ? s.edit === 'operation-json'
            ? 'Request JSON'
            : s.edit.slice(16).replace(/^request\./, '')
          : s.edit.startsWith('setting:')
            ? (SETTING_LABELS[s.edit.slice(8)] ?? 'Edit setting')
            : 'Connect a model endpoint'),
      COLORS.gold
    )
    put(
      4,
      s.edit.startsWith('operation-')
        ? 'Enter a value. Leave empty to use the server default.'
        : s.edit === 'cloud-key'
          ? 'Paste your provider API key'
          : s.edit === 'library-import'
            ? 'Path to a GGUF file'
            : s.edit === 'document-path' || s.edit === 'image-path'
              ? 'Enter a local file path.'
              : s.edit.startsWith('media-')
                ? 'Enter a file path on the server.'
                : titles[s.edit]
                  ? s.edit === 'key-name'
                    ? 'For example: Atomic Agent, work laptop, or test app'
                    : 'Type a name or search term'
                  : s.edit.startsWith('setting:')
                    ? (s.base.config.rows.find((r) => r.path === s.edit.slice(8))?.description ?? '')
                    : 'OpenAI-compatible base URL, including /v1',
      COLORS.muted
    )
    put(
      6,
      (
        (/key|token|password/.test(s.edit) && s.edit !== 'key-name'
          ? '•'.repeat(s.editValue.length)
          : s.editValue) + '_'
      ).slice(-(w - 4)),
      COLORS.text
    )
    if (!cloudEdit)
      tooltip(c, x + 2, y + 8, 'Enter Confirm | Esc Cancel | Ctrl+U Clear', w - 4, COLORS.header)
    if (s.edit === 'library-import' && s.message)
      wrap(s.message, w - 4)
        .slice(0, Math.max(0, h - 12))
        .forEach((line, i) => put(9 + i, line, COLORS.red))
    if (s.edit.startsWith('media-') && s.media.error)
      wrap(s.media.error, w - 4)
        .slice(0, Math.max(1, h - 12))
        .forEach((line, i) => put(9 + i, line, COLORS.red))
    b('save-edit', h - 3, 'Save', 'Validate and save this setting.')
    button(c, 'close', x + 12, y + h - 3, 'Cancel', 'Discard this edit.', focus)
    return
  } else if (s.overlay === 'detail') {
    const r = s.requests[s.selected]
    put(2, 'Request details', COLORS.gold)
    if (r)
      [
        `Model       ${r.model}`,
        `Endpoint    ${r.endpoint}`,
        `Status      ${r.status}`,
        `Duration    ${ms(r.duration)}`,
        `First token ${ms(r.firstToken)}`,
        `Tokens      ${r.tokens ?? 'Not available'}`,
        `ID          ${r.id}`,
      ]
        .slice(0, h - 6)
        .forEach((v, i) => put(4 + i, v))
  } else {
    put(2, 'Connect your application', COLORS.gold)
    wrap(example(s), w - 4)
      .slice(0, h - 8)
      .forEach((r, i) => put(4 + i, r))
    put(h - 5, 'Replace MODEL_ID and supply your key locally.', COLORS.muted)
    b('copy-example', h - 3, 'Copy example', 'Copy the example without including credentials.')
    button(c, 'close', x + 20, y + h - 3, 'Close', 'Return to the previous screen.', focus)
    return
  }
  b('close', h - 3, 'Close  [Esc]', 'Return to the previous screen.')
}
