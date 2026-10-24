import { describe, expect, it, vi } from 'vitest'
import type { Key } from 'ink'
import type { ActionContext } from './actions.js'
import { activate } from './actions.js'
import { createWorkspace } from './state.js'
import type { WorkspaceState } from './state.js'
import { workspaceFrame } from './frame.js'
import { workspaceInput } from './input.js'
import { advanceWaitingGame } from './waiting-game.js'
import {
  GAME_HEIGHT,
  GAME_WIDTH,
  fireShot,
  moveShip,
  newWaitingGame,
  tickWaitingGame,
} from './waiting-game-model.js'

describe('Space Invaders simulation', () => {
  it('moves within the board and limits shots while playing', () => {
    const game = newWaitingGame()
    expect(moveShip(game, -100).ship).toBe(1)
    expect(moveShip(game, 100).ship).toBe(GAME_WIDTH - 2)
    expect(moveShip({ ...game, paused: true }, 1).ship).toBe(game.ship)
    const shot = fireShot(game)
    expect(shot.shots).toEqual([{ x: game.ship, y: GAME_HEIGHT - 2 }])
    expect(fireShot(shot)).toBe(shot)
    expect(fireShot({ ...game, paused: true }).shots).toEqual([])
  })
  it('hits an invader, awards points, and wins when the last invader is cleared', () => {
    const game = { ...newWaitingGame(), invaders: [{ x: 8, y: 3 }], shots: [{ x: 9, y: 4 }] }
    const next = tickWaitingGame(game)
    expect(next).toMatchObject({ invaders: [], shots: [], score: 10, outcome: 'won' })
    expect(game.invaders).toHaveLength(1)
    expect(tickWaitingGame(next)).toBe(next)
  })
  it('bounces at the edge, descends and loses at the ship row', () => {
    const game = { ...newWaitingGame(), tick: 5, invaders: [{ x: GAME_WIDTH - 2, y: GAME_HEIGHT - 3 }] }
    const next = tickWaitingGame(game)
    expect(next.direction).toBe(-1)
    expect(next.invaders).toEqual([{ x: GAME_WIDTH - 2, y: GAME_HEIGHT - 2 }])
    expect(next.outcome).toBe('lost')
  })
  it('does not advance while paused or closed', () => {
    const state = { ...createWorkspace('server'), waitingGame: newWaitingGame() }
    expect(advanceWaitingGame(state)).toBe(state)
    const open = { ...state, overlay: 'waiting-game' as const }
    expect(advanceWaitingGame(open).waitingGame?.tick).toBe(1)
    const paused = { ...open, waitingGame: newWaitingGame(true) }
    expect(advanceWaitingGame(paused)).toBe(paused)
  })
})

function fixture(motion = true) {
  let state: WorkspaceState = {
    ...createWorkspace('server'),
    motion,
    connection: {
      path: 'agent',
      step: 'review',
      agent: 'codex',
      model: 'model.gguf',
      provider: 'llamacpp-upstream',
      port: '1337',
      error: '',
      status: '',
      endpoint: '',
      keyId: '',
      more: false,
      agentPage: 0,
      command: '',
    },
    overlay: 'connection-guide',
  }
  const execute = vi.fn()
  const ctx = {
    get: () => state,
    update: (fn: (s: typeof state) => typeof state) => {
      state = fn(state)
    },
    controller: { runtime: { execute } },
  } as unknown as ActionContext
  return { ctx, execute }
}
const key = (value: Partial<Key>) => value as Key

describe('waiting game integration', () => {
  it('opens by explicit choice, preserves the connection on Escape, and never changes server state', async () => {
    const { ctx, execute } = fixture()
    const draft = ctx.get().connection
    await activate('guide-game', ctx)
    expect(ctx.get().overlay).toBe('waiting-game')
    const input = workspaceInput('', key({ escape: true }), ctx.get(), workspaceFrame(ctx.get(), 54, 24, 0))
    await activate(input.action!, ctx)
    expect(ctx.get()).toMatchObject({
      overlay: 'connection-guide',
      waitingGame: { paused: true },
      focus: 'guide-game',
    })
    expect(ctx.get().connection).toBe(draft)
    expect(execute).not.toHaveBeenCalled()
  })
  it('starts paused with reduced motion and supports play, pause and a clean reset', async () => {
    const { ctx } = fixture(false)
    await activate('guide-game', ctx)
    expect(ctx.get().waitingGame?.paused).toBe(true)
    await activate('waiting-game-toggle', ctx)
    ctx.update(advanceWaitingGame)
    expect(ctx.get().waitingGame).toMatchObject({ paused: false, tick: 1 })
    await activate('waiting-game-toggle', ctx)
    ctx.update(advanceWaitingGame)
    expect(ctx.get().waitingGame?.tick).toBe(1)
    await activate('waiting-game-reset', ctx)
    expect(ctx.get().waitingGame).toEqual(newWaitingGame(true))
  })
  it('routes arrows, A/D and Space to the game and keeps other screens out of play', async () => {
    const { ctx } = fixture()
    await activate('guide-game', ctx)
    const state = ctx.get(),
      frame = workspaceFrame(state, 54, 24, 0)
    expect(workspaceInput('', key({ leftArrow: true }), state, frame).patch?.waitingGame?.ship).toBe(
      state.waitingGame!.ship - 1
    )
    expect(workspaceInput('d', key({}), state, frame).patch?.waitingGame?.ship).toBe(
      state.waitingGame!.ship + 1
    )
    expect(workspaceInput(' ', key({}), state, frame).patch?.waitingGame?.shots).toHaveLength(1)
    expect(workspaceInput('c', key({ ctrl: true }), state, frame)).toEqual({})
    expect(workspaceInput('1', key({ meta: true }), state, frame)).toEqual({})
    expect(workspaceInput('\u001b[<65;10;10M', key({}), state, frame)).toEqual({})
    expect(workspaceInput('q', key({ ctrl: true }), state, frame)).toEqual({ quit: true })
  })
  it.each([
    [54, 24],
    [120, 36],
  ])('keeps controls and model status visible at %s×%s', async (width, height) => {
    const { ctx, execute } = fixture()
    await activate('guide-game', ctx)
    ctx.update((s) => ({
      ...s,
      installed: [{ id: 'model.gguf', provider: 'llamacpp-upstream', name: 'Model' }],
    }))
    const frame = workspaceFrame(ctx.get(), width, height, 0)
    const content = frame.cells.map((row) => row.map((cell) => cell.char).join('')).join('\n')
    expect(content).toContain('Model ready.')
    expect(content.match(/Esc Back/g)).toHaveLength(1)
    expect(frame.targets.map((target) => target.id)).toEqual(
      expect.arrayContaining(['waiting-game-toggle', 'waiting-game-reset', 'waiting-game-close'])
    )
    expect(ctx.get().overlay).toBe('waiting-game')
    for (const target of frame.targets) {
      expect(target.x + target.width).toBeLessThanOrEqual(width)
      expect(target.y + target.height).toBeLessThanOrEqual(height)
    }
    await activate('waiting-game-close', ctx)
    expect(ctx.get()).toMatchObject({ focus: 'guide-configure', connection: { step: 'review' } })
    expect(execute).not.toHaveBeenCalled()
  })
})
