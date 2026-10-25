// Lifted from Atomic-Chat/web-app/src/preview/onboarding/Mines.tsx @ 5043013; adapted: pure game state and explicit win/loss transitions.
export const SIDE = 8
export const MINE_COUNT = 10
export interface MineGame {
  mines: number[] | null
  opened: number[]
  flags: number[]
  exploded: number | null
}
export const newMineGame = (): MineGame => ({ mines: null, opened: [], flags: [], exploded: null })
export const neighbors = (i: number) =>
  Array.from({ length: SIDE * SIDE }, (_, n) => n).filter(
    (n) =>
      n !== i &&
      Math.abs((n % SIDE) - (i % SIDE)) <= 1 &&
      Math.abs(Math.floor(n / SIDE) - Math.floor(i / SIDE)) <= 1
  )
export function placeMines(first: number, random = Math.random) {
  const candidates = Array.from({ length: SIDE * SIDE }, (_, n) => n).filter(
    (n) => n !== first && !neighbors(first).includes(n)
  )
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!]
  }
  return candidates.slice(0, MINE_COUNT)
}
export const mineCount = (game: MineGame, i: number) =>
  neighbors(i).filter((n) => game.mines?.includes(n)).length
export const minesWon = (game: MineGame) => game.opened.length === SIDE * SIDE - MINE_COUNT
export const minesOver = (game: MineGame) => game.exploded !== null || minesWon(game)
export function flagMine(game: MineGame, cell: number): MineGame {
  if (minesOver(game) || game.opened.includes(cell) || cell < 0 || cell >= SIDE * SIDE) return game
  const flags = game.flags.includes(cell)
    ? game.flags.filter((n) => n !== cell)
    : game.flags.length < MINE_COUNT
      ? [...game.flags, cell]
      : game.flags
  return { ...game, flags }
}
export function revealMine(game: MineGame, cell: number, random = Math.random): MineGame {
  if (
    minesOver(game) ||
    game.flags.includes(cell) ||
    game.opened.includes(cell) ||
    cell < 0 ||
    cell >= SIDE * SIDE
  )
    return game
  const mines = game.mines ?? placeMines(cell, random)
  if (mines.includes(cell)) return { ...game, mines, exploded: cell }
  const opened = new Set(game.opened),
    pending = [cell]
  while (pending.length) {
    const i = pending.pop()!
    if (opened.has(i) || game.flags.includes(i) || mines.includes(i)) continue
    opened.add(i)
    if (!neighbors(i).some((n) => mines.includes(n))) pending.push(...neighbors(i))
  }
  return { ...game, mines, opened: [...opened] }
}
