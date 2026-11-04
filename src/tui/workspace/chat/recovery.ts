import type { ActionContext } from '../action-types.js'
import type { WorkspaceState } from '../state.js'
import type { Canvas } from '../draw/canvas.js'
import { button, COLORS, text, wrapWords } from '../draw/canvas.js'
import { panel } from '../draw/cards.js'
import { markSynced } from './live-conversation.js'

export interface ChatNotice {
  message: string
  details: string
  conflict: boolean
}
export function chatNotice(details: string): ChatNotice {
  const conflict = /conversation changed|conversation.*another client/i.test(details)
  return {
    conflict,
    details,
    message: conflict ? 'Conversation changed in another client.' : 'The request could not finish.',
  }
}
export function drawChatRecovery(
  c: Canvas,
  s: WorkspaceState,
  x: number,
  y: number,
  width: number,
  focus: string
) {
  if (!s.chatNotice) return
  text(c, x, y, `! ${s.chatNotice.message}`, COLORS.statusError, width)
  let left = x
  if (s.chatNotice.conflict && s.conversation)
    left +=
      button(
        c,
        'chat-reopen',
        left,
        y + 1,
        'Reopen conversation',
        'Load the latest history; keep your draft',
        focus
      ) + 1
  left +=
    button(
      c,
      'chat-retry',
      left,
      y + 1,
      'Retry draft',
      'Retry your draft, reopening a conflicting conversation first',
      focus
    ) + 1
  button(c, 'chat-error-details', left, y + 1, 'Details', 'Read diagnostic details', focus)
}
export function drawChatDetail(c: Canvas, s: WorkspaceState, focus: string) {
  const width = Math.min(84, c.width - 6),
    height = Math.min(18, c.height - 4),
    x = Math.floor((c.width - width) / 2),
    y = Math.floor((c.height - height) / 2)
  c.targets = []
  c.popover = { x, y, width, height }
  panel(c, x, y, width, height)
  const model = s.chatDetail === 'model'
  text(c, x + 2, y + 1, model ? 'Selected model' : 'Request details', COLORS.text, width - 4, undefined, true)
  const lines = model
    ? [
        `Model: ${s.model || 'None selected'}`,
        `Engine: ${s.engine.split('|')[0] || 'Not selected'}`,
        `API: ${s.workspace?.api.running ? 'running' : 'stopped'}`,
        `Model: ${s.modelLoad ? 'loading' : s.workspace?.services.some((v) => v.model === s.model && ['ready', 'loaded', 'running'].includes(v.state)) ? 'ready' : 'not loaded'}`,
      ]
    : [s.chatNotice?.details ?? s.loadError?.message ?? 'No diagnostic details.']
  const rows = lines.flatMap((line) => wrapWords(line, width - 4))
  const visible = height - 5,
    offset = Math.min(s.scroll, Math.max(0, rows.length - visible))
  rows
    .slice(offset, offset + visible)
    .forEach((line, i) => text(c, x + 2, y + 3 + i, line, COLORS.text, width - 4))
  if (rows.length > visible)
    text(c, x + 2, y + height - 2, 'PageUp / PageDown · Scroll details', COLORS.muted, width - 4)
  button(c, 'close', x + width - 9, y + 1, 'Close', 'Return to the composer', focus)
}
export async function recoveryAction(id: string, ctx: ActionContext): Promise<boolean> {
  if (ctx.get().overlay === 'chat-detail' && ['scroll-up', 'scroll-down'].includes(id)) {
    ctx.update((s) => ({ ...s, scroll: Math.max(0, s.scroll + (id === 'scroll-down' ? 3 : -3)) }))
    return true
  }
  if (id === 'model-details' || id === 'chat-error-details') {
    ctx.update((s) => ({
      ...s,
      overlay: 'chat-detail',
      chatDetail: id === 'model-details' ? 'model' : 'error',
      overlayReturnFocus: s.focus,
      overlayReturnScroll: s.scroll,
      focus: 'close',
      scroll: 0,
    }))
    return true
  }
  if (!['chat-reopen', 'chat-retry'].includes(id)) return false
  const before = ctx.get()
  if (before.generating || before.busy) return true
  if ((id === 'chat-reopen' || before.chatNotice?.conflict) && before.conversation) {
    ctx.update((s) => ({ ...s, busy: true }))
    try {
      const saved = await ctx.controller.history.load(before.conversation.id)
      if (!saved)
        throw new Error('This conversation was deleted. Start a new chat; your draft is still here.')
      if (ctx.get().conversation?.id !== saved.id || ctx.get().page !== 'chat') return true
      markSynced(ctx.controller, saved)
      ctx.update((s) => ({
        ...s,
        conversation: saved,
        messages: saved.messages,
        chatNotice: undefined,
        message: 'Latest conversation opened. Your draft is unchanged.',
        focus: 'composer',
      }))
    } catch (error) {
      ctx.update((s) => ({ ...s, chatNotice: chatNotice(String(error)) }))
      return true
    } finally {
      ctx.update((s) => ({ ...s, busy: false }))
    }
  }
  const after = ctx.get()
  if (
    id === 'chat-retry' &&
    after.page === 'chat' &&
    after.draft === before.draft &&
    after.images === before.images &&
    after.documents === before.documents
  )
    ctx.send()
  return true
}
