import { workspaceHeaderRows } from '../draw/brand-header.js'
import { downloadContentBottom } from '../download-layout.js'
import type { Key } from 'ink'
import {
  flagMine,
  mineCount,
  minesOver,
  minesWon,
  newMineGame,
  revealMine,
  setupModelPending,
} from '../../../workspace-view/index.js'
import type { MineGame } from '../../../workspace-view/index.js'
import type { ActionContext } from '../actions.js'
import type { Canvas } from '../draw/canvas.js'
import { button, COLORS, text, wrapWords } from '../draw/canvas.js'
import { actionButton } from '../draw/cards.js'
import { fieldControl, scrollTrack } from '../draw/controls.js'
import type { InputResult } from '../input-types.js'
import type { WorkspaceState } from '../state.js'

export interface FinalSetupState {
  destination: 'endpoint' | 'agent'
  game: MineGame
  flagMode: boolean
  email: string
  emailStatus: 'idle' | 'invalid' | 'confirming' | 'confirmed'
}
export const finalSetupState = (destination: FinalSetupState['destination']): FinalSetupState => ({
  destination,
  game: newMineGame(),
  flagMode: false,
  email: '',
  emailStatus: 'idle',
})

export function drawWaitingSetup(c: Canvas, s: WorkspaceState, focus: string) {
  const state = s.finalSetup
  if (!state) return
  const width = Math.min(88, c.width - 8),
    x = Math.floor((c.width - width) / 2),
    pending = setupModelPending(s.workspace, s.model),
    headingY = workspaceHeaderRows(c),
    bottom = downloadContentBottom(c, s),
    cellWidth = c.width < 76 ? 2 : 3,
    gameY = headingY + 2,
    continueLabel = pending ? "I can't wait - take me to the control panel" : 'Continue',
    compact = bottom - gameY < 13,
    padding = compact ? 1 : 3,
    actionWidth = Math.min(width - 9, continueLabel.length + padding * 2),
    actionLines = wrapWords(continueLabel, actionWidth - padding * 2),
    actionHeight = actionLines.length + (compact ? 0 : 2),
    gameRows = Math.min(8, bottom - gameY - actionHeight - 1),
    sideX = x + cellWidth * 8 + (cellWidth === 2 ? 4 : 6),
    sideWidth = x + width - sideX,
    actionY = gameY + Math.max(0, gameRows) + 2,
    actionX = x + width - actionWidth,
    background = focus === 'wait-continue' ? COLORS.composer : COLORS.gold
  for (let row = 0; row < actionHeight; row++)
    text(c, actionX, actionY + row, ' '.repeat(actionWidth), COLORS.ground, actionWidth, background)
  actionLines.forEach((line, row) =>
    text(
      c,
      actionX + padding,
      actionY + row + (compact ? 0 : 1),
      line,
      COLORS.ground,
      actionWidth - padding * 2,
      background,
      true
    )
  )
  c.targets.push({
    id: 'wait-continue',
    x: actionX,
    y: actionY,
    width: actionWidth,
    height: actionHeight,
    hint: 'Open your server; downloads continue',
  })
  button(
    c,
    'wait-back',
    x,
    actionY + Math.floor(actionHeight / 2),
    'Back',
    'Return to connection choice',
    focus
  )
  text(c, x, headingY, pending ? 'Getting your model ready' : 'Your model is downloaded', COLORS.gold, width)
  if (gameRows < 1) {
    text(c, x, headingY + 2, 'Increase terminal height to show setup.', COLORS.muted, width)
    return
  }
  const game = state.game,
    focusedCell = focus.startsWith('wait-cell:') ? Number(focus.slice(10)) : 0,
    startRow = Math.max(0, Math.min(8 - gameRows, Math.floor(focusedCell / 8) - Math.floor(gameRows / 2))),
    result =
      game.exploded !== null
        ? 'Mine hit'
        : minesWon(game)
          ? 'Board cleared'
          : `${10 - game.flags.length} mines`
  text(c, x, gameY - 1, result, COLORS.muted, cellWidth * 8)
  for (let cell = startRow * 8; cell < (startRow + gameRows) * 8; cell++) {
    const open = game.opened.includes(cell),
      bomb = game.mines?.includes(cell),
      count = mineCount(game, cell),
      label =
        cell === game.exploded
          ? '*'
          : game.flags.includes(cell)
            ? 'F'
            : open
              ? count
                ? String(count)
                : ' '
              : minesOver(game) && bomb
                ? '*'
                : '#',
      id = `wait-cell:${cell}`,
      active = focus === id,
      cellX = x + (cell % 8) * cellWidth,
      cellY = gameY + Math.floor(cell / 8) - startRow
    text(
      c,
      cellX,
      cellY,
      cellWidth === 2 ? `${label} ` : ` ${label} `,
      active ? COLORS.ground : COLORS.text,
      cellWidth,
      active ? COLORS.gold : open ? COLORS.ground : COLORS.header
    )
    c.targets.push({
      id,
      x: cellX,
      y: cellY,
      width: cellWidth,
      height: 1,
      hint: 'Arrows Move | Enter Reveal | F Flag',
    })
  }
  scrollTrack(c, x + cellWidth * 8 + 1, gameY, gameRows, startRow, gameRows, 8)
  button(c, 'wait-new', x, gameY + gameRows, 'New game', 'Start a new board', focus)
  button(
    c,
    'wait-flag',
    x + 10,
    gameY + gameRows,
    state.flagMode ? 'Flag on' : 'Flag off',
    'Toggle flag placement',
    focus
  )
  text(c, sideX, gameY, 'Email me when it is ready', COLORS.text, sideWidth)
  fieldControl(
    c,
    'wait-email',
    sideX,
    gameY + 2,
    sideWidth - 17,
    state.email || 'Email address',
    'Email address',
    focus
  )
  const label =
    state.emailStatus === 'confirming'
      ? 'Saving...'
      : state.emailStatus === 'confirmed'
        ? 'Confirmed'
        : 'Confirm'
  actionButton(c, 'wait-save', sideX + sideWidth - 15, gameY + 1, label, 'Confirm email address', focus)
  if (state.emailStatus === 'confirming' || state.emailStatus === 'confirmed') c.targets.pop()
  const message =
    state.emailStatus === 'invalid'
      ? 'Enter a valid email.'
      : state.emailStatus === 'confirmed'
        ? 'Email saved'
        : ''
  text(c, sideX, gameY + 4, message, state.emailStatus === 'invalid' ? '#ffb3a7' : COLORS.muted, sideWidth)
}

export async function waitingSetupAction(id: string, ctx: ActionContext): Promise<boolean> {
  const s = ctx.get(),
    state = s.finalSetup
  if (!state || !id.startsWith('wait-')) return false
  const patch = (next: Partial<FinalSetupState>) =>
    ctx.update((v) => (v.finalSetup ? { ...v, finalSetup: { ...v.finalSetup, ...next } } : v))
  if (id === 'wait-back')
    ctx.update((v) => ({ ...v, finalSetup: null, focus: `first-connect:${state.destination}` }))
  else if (id === 'wait-new') patch({ game: newMineGame() })
  else if (id === 'wait-flag') patch({ flagMode: !state.flagMode })
  else if (id === 'wait-save') {
    if (state.emailStatus === 'confirming' || state.emailStatus === 'confirmed') return true
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email.trim())
    patch({ emailStatus: valid ? 'confirming' : 'invalid' })
    if (!valid) ctx.update((v) => ({ ...v, focus: 'wait-email' }))
    else {
      // Local mock only; no subscription or email is sent. A notification service remains future work.
      await new Promise((resolve) => setTimeout(resolve, 400))
      const current = ctx.get().finalSetup
      if (current?.email === state.email && current.emailStatus === 'confirming')
        patch({ emailStatus: 'confirmed' })
    }
  } else if (id.startsWith('wait-cell:')) {
    const cell = Number(id.slice(10))
    patch({ game: state.flagMode ? flagMine(state.game, cell) : revealMine(state.game, cell) })
  }
  return id !== 'wait-continue'
}

export function waitingSetupInput(input: string, key: Key, s: WorkspaceState): InputResult | null {
  const state = s.finalSetup
  if (!state || s.overlay || input.startsWith('[<')) return null
  if (key.escape) return { action: 'wait-back' }
  if (s.focus === 'wait-email' && !key.ctrl && !key.meta && !key.tab) {
    if (state.emailStatus === 'confirming') return {}
    if (key.return) return { action: 'wait-save' }
    if (key.backspace || key.delete)
      return { patch: { finalSetup: { ...state, email: state.email.slice(0, -1), emailStatus: 'idle' } } }
    if (input && [...input].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127))
      return {
        patch: { finalSetup: { ...state, email: (state.email + input).slice(0, 254), emailStatus: 'idle' } },
      }
  }
  if (s.focus.startsWith('wait-cell:')) {
    const cell = Number(s.focus.slice(10))
    if (!key.ctrl && !key.meta && input.toLowerCase() === 'f')
      return { patch: { finalSetup: { ...state, game: flagMine(state.game, cell) } } }
    const move = key.leftArrow ? -1 : key.rightArrow ? 1 : key.upArrow ? -8 : key.downArrow ? 8 : 0
    if (move) return { patch: { focus: `wait-cell:${(cell + move + 64) % 64}` } }
  }
  return null
}
