import type { ActionContext } from '../actions.js'
import type { WorkspaceState } from '../state.js'
import type { Canvas } from '../draw/canvas.js'
import { COLORS, text, button, wrapWords } from '../draw/canvas.js'
import { actionButton, panel } from '../draw/cards.js'
import { quietButton } from '../draw/controls.js'

const PERMISSIONS = [
  {
    id: 'notifications',
    title: 'Notifications',
    detail: 'Know when a model is ready or a long task finishes.',
    icon: '[!]',
  },
  {
    id: 'microphone',
    title: 'Microphone',
    detail: 'Speak your prompts and use voice conversations.',
    icon: '(|)',
  },
] as const

export async function openFirstRunServer(ctx: ActionContext) {
  const s = ctx.get(),
    setup = s.setup,
    model = setup?.selections[0]?.plan.model_id ?? setup?.path?.job?.model ?? s.model
  await ctx.controller.runtime.execute('setup.manual')
  ctx.update((v) => ({
    ...v,
    setupComplete: true,
    firstRun: null,
    finalSetup: null,
    setup:
      setup?.preparing || setup?.selections.length || setup?.path?.job
        ? { ...setup, destination: 'server' }
        : null,
    page: 'server',
    overlay: null,
    serverView: 'overview',
    focus: 'server-search',
    model,
    message: '',
  }))
}

export async function accessPurposeAction(id: string, ctx: ActionContext): Promise<boolean> {
  const s = ctx.get(),
    permissionDialog = s.overlay === 'setup-permission'
  if (permissionDialog && ['close', 'first-permission-close'].includes(id)) {
    ctx.update((v) => ({
      ...v,
      overlay: null,
      focus: s.edit.startsWith('skip-') ? 'first-next' : `first-permission:${s.edit}`,
      message: '',
    }))
    return true
  }
  if (id.startsWith('first-permission:')) {
    ctx.update((v) => ({
      ...v,
      overlay: 'setup-permission',
      edit: id.slice(17),
      focus: 'first-permission-close',
    }))
    return true
  }
  if (id === 'first-permission-web' && permissionDialog) {
    try {
      await ctx.controller.runtime.openAdmin()
      ctx.update((v) => ({ ...v, message: 'Continue in the web app to enable access.' }))
    } catch (error) {
      ctx.update((v) => ({ ...v, message: error instanceof Error ? error.message : String(error) }))
    }
    return true
  }
  return false
}

export function drawSetupPermissions(
  c: Canvas,
  x: number,
  y: number,
  width: number,
  bottom: number,
  focus: string
) {
  const height = Math.min(6, Math.max(3, Math.floor((bottom - y) / 2)))
  PERMISSIONS.forEach((p, index) => {
    const top = y + index * height
    panel(c, x, top, width, height)
    text(c, x + 2, top + 1, `${p.icon} ${p.title}`, COLORS.text, width - 16, undefined, true)
    if (height >= 5)
      wrapWords(p.detail, width - 4)
        .slice(0, height - 3)
        .forEach((line, i) => text(c, x + 2, top + 2 + i, line, COLORS.muted, width - 4))
    button(
      c,
      `first-permission:${p.id}`,
      x + width - 18,
      top + 1,
      'Allow for Web',
      `Manage ${p.title.toLowerCase()} access`,
      focus
    )
  })
}

export function drawPermissionDialog(c: Canvas, s: WorkspaceState, focus: string) {
  const p = PERMISSIONS.find((p) => p.id === s.edit) ?? PERMISSIONS[0],
    width = Math.min(68, c.width - 8),
    x = Math.floor((c.width - width) / 2)
  const title = `Allow ${p.title.toLowerCase()} for Web?`
  const detail =
    p.id === 'microphone'
      ? 'Microphone access is requested by your browser when you start recording. Open the web app to enable it; text chat works here without it.'
      : 'Download notifications require browser permission. Open the web app to enable notifications on this device.'
  const lines = wrapWords(detail, width - 4),
    message = s.message ? wrapWords(s.message, width - 4) : [],
    height = Math.min(c.height - 6, lines.length + message.length + 8),
    y = Math.floor((c.height - height) / 2)
  c.targets = []
  panel(c, x, y, width, height)
  c.popover = { x, y, width, height }
  text(c, x + 2, y + 1, title, COLORS.gold, width - 4)
  lines.forEach((line, i) => text(c, x + 2, y + 3 + i, line, COLORS.text, width - 4))
  message.forEach((line, i) => text(c, x + 2, y + 3 + lines.length + i, line, COLORS.gold, width - 4))
  quietButton(c, 'first-permission-close', x + 2, y + height - 3, 'Not now', 'Return to permissions', focus)
  const label = 'Open web app'
  actionButton(
    c,
    'first-permission-web',
    x + width - label.length - 8,
    y + height - 4,
    label,
    'Enable access in your browser',
    focus
  )
}
