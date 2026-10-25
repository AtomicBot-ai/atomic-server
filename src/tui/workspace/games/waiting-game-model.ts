/** Deterministic, local-only game state; one tick is 160 milliseconds. */
export const GAME_WIDTH = 42
export const GAME_HEIGHT = 9
export interface Invader {
  x: number
  y: number
}
export interface WaitingGame {
  ship: number
  invaders: Invader[]
  shots: Invader[]
  direction: 1 | -1
  tick: number
  score: number
  paused: boolean
  outcome: 'playing' | 'won' | 'lost'
}
export function newWaitingGame(paused = false): WaitingGame {
  return {
    ship: Math.floor(GAME_WIDTH / 2),
    invaders: Array.from({ length: 12 }, (_, i) => ({ x: 5 + (i % 6) * 6, y: 1 + Math.floor(i / 6) * 2 })),
    shots: [],
    direction: 1,
    tick: 0,
    score: 0,
    paused,
    outcome: 'playing',
  }
}
export function moveShip(game: WaitingGame, delta: number): WaitingGame {
  if (game.paused || game.outcome !== 'playing') return game
  return { ...game, ship: Math.max(1, Math.min(GAME_WIDTH - 2, game.ship + delta)) }
}
export function fireShot(game: WaitingGame): WaitingGame {
  if (game.paused || game.outcome !== 'playing' || game.shots.length >= 4) return game
  if (game.shots.some((shot) => shot.x === game.ship && shot.y === GAME_HEIGHT - 2)) return game
  return { ...game, shots: [...game.shots, { x: game.ship, y: GAME_HEIGHT - 2 }] }
}
export function tickWaitingGame(game: WaitingGame): WaitingGame {
  if (game.paused || game.outcome !== 'playing') return game
  const tick = game.tick + 1
  let direction = game.direction
  let invaders = game.invaders.map((invader) => ({ ...invader }))
  const shots = game.shots.map((shot) => ({ x: shot.x, y: shot.y - 1 })).filter((shot) => shot.y >= 0)
  let score = game.score
  const remaining = shots.filter((shot) => {
    const hit = invaders.findIndex((invader) => invader.y === shot.y && Math.abs(invader.x - shot.x) <= 1)
    if (hit < 0) return true
    invaders.splice(hit, 1)
    score += 10
    return false
  })
  if (tick % 6 === 0) {
    const edge = invaders.some(
      (invader) => invader.x + direction < 1 || invader.x + direction > GAME_WIDTH - 2
    )
    if (edge) direction = direction === 1 ? -1 : 1
    invaders = invaders.map((invader) => ({
      x: invader.x + (edge ? 0 : direction),
      y: invader.y + (edge ? 1 : 0),
    }))
  }
  return {
    ...game,
    tick,
    direction,
    invaders,
    shots: remaining,
    score,
    outcome: !invaders.length
      ? 'won'
      : invaders.some((invader) => invader.y >= GAME_HEIGHT - 2)
        ? 'lost'
        : 'playing',
  }
}
