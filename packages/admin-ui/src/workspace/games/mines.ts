// Lifted from Atomic-Chat/web-app/src/preview/onboarding/Mines.tsx @ 5043013; adapted: rules shared with terminal onboarding.
// Shared browser-safe Minesweeper rules also used by terminal onboarding.
export {
  newMineGame,
  neighbors,
  placeMines,
  flagMine,
  mineCount,
  minesOver,
  minesWon,
  revealMine,
  MINE_COUNT,
  SIDE,
} from '@view'
export type { MineGame } from '@view'
