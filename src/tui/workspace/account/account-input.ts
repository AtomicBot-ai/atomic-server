/** Keys of the account screens: typing the email and its code, and `a` / `s` on Remote access. */
import type { Key } from 'ink'
import type { InputResult } from '../input-types.js'
import { mouseReport } from '../input/mouse-report.js'
import type { WorkspaceState } from '../state.js'
import { accountUi, shownAccount } from './account-model.js'

/** Single keys on Server → Remote access while signed in; also in Settings → Keyboard shortcuts. */
export const ACCOUNT_SHORTCUTS = [
  ['A', 'Add a device (Server → Remote access)'],
  ['S', 'Share with your devices on or off (Server → Remote access)'],
] as const

function typed(s: WorkspaceState, value: string): InputResult {
  const ui = accountUi(s)
  return ui.step === 'code'
    ? { patch: { accountUi: { ...ui, code: value.replace(/\D/g, '').slice(0, 6), error: '' } } }
    : { patch: { accountUi: { ...ui, email: value.slice(0, 320), error: '' } } }
}

function fieldInput(input: string, key: Key, s: WorkspaceState): InputResult | null {
  if (key.tab || key.escape || key.upArrow || key.downArrow || key.meta) return null
  const ui = accountUi(s),
    value = ui.step === 'code' ? ui.code : ui.email
  if (key.ctrl) return input === 'u' ? typed(s, '') : null
  if (key.return) return { action: ui.step === 'code' ? 'account-email-verify' : 'account-email-send' }
  if (key.backspace || key.delete) return typed(s, [...value].slice(0, -1).join(''))
  // A paste may hold CR or control bytes in one Ink event; never keep those in a field.
  // eslint-disable-next-line no-control-regex
  const text = input.replace(/[\u0000-\u001f\u007f]/g, '')
  return text ? typed(s, value + text) : {}
}

export function accountInput(input: string, key: Key, s: WorkspaceState): InputResult | null {
  if (mouseReport(input) || input.startsWith('[<')) return null
  if (s.overlay === 'account-email' && s.focus === 'account-field') return fieldInput(input, key, s)
  if (s.overlay || s.page !== 'server' || s.serverView !== 'remote' || key.ctrl || key.meta) return null
  if (!shownAccount(s.workspace)?.signed_in) return null
  if (input === 'a') return { action: 'account-pair' }
  if (input === 's') return { action: 'account-share' }
  return null
}
