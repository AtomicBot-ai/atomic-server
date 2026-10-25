import type { Key } from 'ink'
import type { WorkspaceState } from '../state.js'
import { firstModelChoices, isFirstModel } from './first-model.js'

/** Arrow/page keys and the wheel scroll choices without committing the radio selection. */
export function firstModelInput(key: Key, s: WorkspaceState, wheel?: number) {
  if (!isFirstModel(s) || s.overlay) return null
  const prefix = 'first-model-choice:'
  if (wheel === undefined && !s.focus.startsWith(prefix)) return null
  const count = firstModelChoices(s).length
  if (!count) return null
  const at = s.focus.startsWith(prefix) ? Number(s.focus.slice(prefix.length)) : s.selected
  const delta = wheel ?? (key.pageUp ? -5 : key.pageDown ? 5 : key.upArrow ? -1 : key.downArrow ? 1 : 0)
  if (!delta && !key.home && !key.end) return null
  const selected = Math.max(0, Math.min(count - 1, key.home ? 0 : key.end ? count - 1 : at + delta))
  return { patch: { selected, focus: `${prefix}${selected}`, hover: '' } }
}
