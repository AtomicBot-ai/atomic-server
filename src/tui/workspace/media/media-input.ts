import type { Key } from 'ink'
import type { WorkspaceState } from '../state.js'
import type { InputResult } from '../input.js'
import { mediaFields, mediaTask } from './media-model.js'
import { mouseReport } from '../mouse-report.js'

export function mediaInput(input: string, key: Key, s: WorkspaceState): InputResult | null {
  if (!mediaTask(s)) return null
  const mouse = mouseReport(input)
  if (
    s.overlay === 'media-models' &&
    (key.upArrow || key.downArrow || (mouse && s.mouse && mouse.code & 64))
  ) {
    const at = Number(s.focus.slice(12)) || 0
    const delta = key.upArrow || (mouse && !(mouse.code & 1)) ? -1 : 1
    return {
      patch: {
        focus: `media-model:${Math.max(0, Math.min(s.media.models.length - 1, at + delta))}`,
        hover: '',
      },
    }
  }
  if (s.overlay) return null
  if (s.focus.startsWith('operation-field:') && (key.upArrow || key.downArrow)) {
    const fields = mediaFields(s),
      at = fields.findIndex((field) => `operation-field:${field.path}` === s.focus)
    const next = Math.max(0, Math.min(fields.length - 1, at + (key.upArrow ? -1 : 1)))
    return { patch: { focus: `operation-field:${fields[next]?.path ?? ''}`, selected: next, hover: '' } }
  }
  return null
}
