import { describe, expect, it } from 'vitest'
import { flagMine, mineCount, minesWon, neighbors, newMineGame, placeMines, revealMine } from './mines'

describe('Minesweeper rules', () => {
  it('keeps the first square and its neighbors safe at every board position', () => {
    for (let i = 0; i < 64; i++) {
      const mines = placeMines(i, () => 0.37)
      expect(new Set(mines).size).toBe(10)
      expect(mines.some((mine) => mine === i || neighbors(i).includes(mine))).toBe(false)
    }
  })
  it('counts neighbors without wrapping board edges', () => {
    expect(neighbors(0)).toEqual([1, 8, 9])
    expect(neighbors(7)).toEqual([6, 14, 15])
    expect(mineCount({ ...newMineGame(), mines: [7, 8, 9] }, 0)).toBe(2)
  })
  it('expands empty squares while preserving flags and mines', () => {
    const mines = [54, 55, 56, 57, 58, 59, 60, 61, 62, 63]
    const before = { ...newMineGame(), mines, flags: [0] }
    const game = revealMine(before, 1)
    expect(game.opened.length).toBeGreaterThan(20)
    expect(game.opened).not.toContain(0)
    expect(game.opened.some((n) => mines.includes(n))).toBe(false)
    expect(before.opened).toEqual([])
    expect(revealMine(game, 0)).toBe(game)
  })
  it('limits flags, supports unflagging, and leaves revealed squares unchanged', () => {
    let game = newMineGame()
    for (let i = 0; i < 11; i++) game = flagMine(game, i)
    expect(game.flags).toHaveLength(10)
    game = flagMine(game, 0)
    expect(game.flags).not.toContain(0)
    game = revealMine(game, 63, () => 0.4)
    expect(flagMine(game, 63)).toBe(game)
  })
  it('stops moves after winning or hitting a mine and supports a clean restart', () => {
    const mines = Array.from({ length: 10 }, (_, i) => i + 54)
    const win = revealMine({ ...newMineGame(), mines }, 0)
    expect(minesWon(win)).toBe(true)
    expect(flagMine(win, 54)).toBe(win)
    const loss = revealMine({ ...newMineGame(), mines }, 63)
    expect(loss.exploded).toBe(63)
    expect(revealMine(loss, 0)).toBe(loss)
    expect(newMineGame()).toEqual({ mines: null, opened: [], flags: [], exploded: null })
  })
})
