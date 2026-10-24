import type { Key } from 'ink'
import { connectionModelState } from '../../workspace-view/index.js'
import { COLORS, text, wrap } from './draw/canvas.js'
import type { Canvas } from './draw/canvas.js'
import { panel } from './draw/cards.js'
import type { ActionContext } from './actions.js'
import type { InputResult } from './input.js'
import type { WorkspaceState } from './state.js'
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  fireShot,
  moveShip,
  newWaitingGame,
  tickWaitingGame,
} from './waiting-game-model.js'

export function waitingGameAction(id: string, ctx: ActionContext): boolean {
  const s = ctx.get()
  if (id === 'guide-game' && s.connection?.step === 'review') {
    ctx.update((v) => ({
      ...v,
      overlay: 'waiting-game',
      waitingGame: v.waitingGame ?? newWaitingGame(!v.motion),
      focus: 'waiting-game-toggle',
      hover: '',
    }))
    return true
  }
  if (s.overlay !== 'waiting-game') return false
  if (id === 'waiting-game-close' || id === 'close') {
    ctx.update((v) => ({
      ...v,
      overlay: 'connection-guide',
      waitingGame: v.waitingGame ? { ...v.waitingGame, paused: true } : null,
      focus: v.installed.some((model) => model.id === v.connection?.model) ? 'guide-configure' : 'guide-game',
      hover: '',
    }))
    return true
  }
  if (id === 'waiting-game-toggle' || id === 'waiting-game-reset') {
    ctx.update((v) => ({
      ...v,
      waitingGame:
        id === 'waiting-game-reset'
          ? newWaitingGame(!v.motion)
          : { ...(v.waitingGame ?? newWaitingGame()), paused: !v.waitingGame?.paused },
      hover: '',
    }))
    return true
  }
  return false
}

export function advanceWaitingGame(s: WorkspaceState): WorkspaceState {
  if (s.overlay !== 'waiting-game' || !s.waitingGame) return s
  const waitingGame = tickWaitingGame(s.waitingGame)
  return waitingGame === s.waitingGame ? s : { ...s, waitingGame }
}

export function waitingGameInput(input: string, key: Key, s: WorkspaceState, c: Canvas): InputResult | null {
  if (s.overlay !== 'waiting-game') return null
  if (key.ctrl && input === 'q') return { quit: true }
  if (key.escape) return { action: 'waiting-game-close' }
  if (key.tab) {
    const index = c.targets.findIndex((target) => target.id === s.focus)
    return {
      patch: {
        focus: c.targets[(index + (key.shift ? -1 : 1) + c.targets.length) % c.targets.length]?.id ?? '',
        hover: '',
      },
    }
  }
  if (key.return) return { action: s.hover || s.focus }
  if (key.ctrl || key.meta || !s.waitingGame) return {}
  if (input.toLowerCase() === 'p') return { action: 'waiting-game-toggle' }
  if (input.toLowerCase() === 'r') return { action: 'waiting-game-reset' }
  if (key.leftArrow || input.toLowerCase() === 'a')
    return { patch: { waitingGame: moveShip(s.waitingGame, -1) } }
  if (key.rightArrow || input.toLowerCase() === 'd')
    return { patch: { waitingGame: moveShip(s.waitingGame, 1) } }
  if (input === ' ') return { patch: { waitingGame: fireShot(s.waitingGame) } }
  return {}
}

function downloadStatus(s: WorkspaceState): string {
  return connectionModelState(
    s.connection?.model ?? '',
    s.installed,
    s.workspace?.setups ?? [],
    s.workspace?.downloads ?? [],
    s.connection?.provider
  ).status
}

export function drawWaitingGame(c: Canvas, s: WorkspaceState): void {
  c.targets = []
  const game = s.waitingGame ?? newWaitingGame(true)
  const x = Math.floor((c.width - GAME_WIDTH - 2) / 2)
  const y = Math.max(7, Math.floor((c.height - GAME_HEIGHT - 2) / 2))
  const top = y - 6,
    width = GAME_WIDTH + 6,
    height = Math.min(c.height - 3 - top, GAME_HEIGHT + 10)
  panel(c, x - 2, top, width, height)
  c.popover = { x: x - 2, y: top, width, height }
  text(c, x, y - 5, 'SPACE INVADERS', COLORS.gold, GAME_WIDTH, undefined, true)
  text(c, x, y - 3, s.connection?.model ?? 'Model download', COLORS.text, GAME_WIDTH + 2)
  wrap(downloadStatus(s), GAME_WIDTH + 2)
    .slice(0, 2)
    .forEach((line, index) => text(c, x, y - 2 + index, line, COLORS.muted, GAME_WIDTH + 2))
  panel(c, x, y, GAME_WIDTH + 2, GAME_HEIGHT + 2)
  game.invaders.forEach((invader) =>
    text(c, x + invader.x, y + 1 + invader.y, game.tick % 12 < 6 ? '[o]' : '{o}', COLORS.gold, 3)
  )
  game.shots.forEach((shot) => text(c, x + 1 + shot.x, y + 1 + shot.y, '|', COLORS.text, 1))
  text(c, x + game.ship, y + GAME_HEIGHT, '/^\\', COLORS.green, 3)
  const state =
    game.outcome === 'won'
      ? 'Wave cleared'
      : game.outcome === 'lost'
        ? 'Invaders landed'
        : game.paused
          ? 'Paused'
          : ''
  const score = `Score ${game.score}`
  text(c, x, y + GAME_HEIGHT + 2, score, COLORS.text, GAME_WIDTH + 2)
  if (game.paused || game.outcome !== 'playing') {
    const label = ` ${state} `
    text(
      c,
      x + Math.floor((GAME_WIDTH + 2 - label.length) / 2),
      y + 5,
      label,
      COLORS.ground,
      label.length,
      COLORS.gold,
      true
    )
  }
}
