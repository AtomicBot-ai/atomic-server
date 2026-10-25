// Lifted from Atomic-Chat/web-app/src/preview/onboarding/Mines.tsx @ 5043013; adapted: optional classic Minesweeper dialog while server downloads continue.
import { useRef, useState } from 'react'
import { Bomb, Flag, Frown, Smile, Trophy, X } from 'lucide-react'
import { useDialog } from '../useDialog'
import { flagMine, mineCount, minesOver, minesWon, newMineGame, revealMine, MINE_COUNT, SIDE } from './mines'
import './download-game.css'

export function DownloadGame({
  onClose,
  status,
  inline = false,
}: {
  onClose: () => void
  status?: string
  inline?: boolean
}) {
  const dialog = useDialog(onClose, !inline)
  const [game, setGame] = useState(newMineGame)
  const [flagMode, setFlagMode] = useState(false)
  const [focused, setFocused] = useState(0)
  const cells = useRef<(HTMLButtonElement | null)[]>([])
  const won = minesWon(game),
    over = minesOver(game),
    reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const reset = () => {
    setGame(newMineGame())
    setFlagMode(false)
    setFocused(0)
  }
  return (
    <div className={inline ? 'inline-download-game' : 'modal-shade download-game-shade'}>
      <section
        ref={dialog}
        className="download-game-dialog"
        role={inline ? 'region' : 'dialog'}
        aria-modal={inline ? undefined : true}
        aria-label="Minesweeper"
        tabIndex={-1}
      >
        <header className="mine-titlebar">
          <h2>Minesweeper</h2>
          {!inline && (
            <button aria-label="Close game" onClick={onClose}>
              <X size={17} />
            </button>
          )}
        </header>
        <div className="mine-game-body">
          {status && (
            <p className="mine-download-status" role="status">
              {status}
            </p>
          )}
          <div className="mine-controls">
            <output aria-label="Mines left">{String(MINE_COUNT - game.flags.length).padStart(3, '0')}</output>
            <button aria-label="New game" title="New game" onClick={reset}>
              {won ? (
                <Trophy size={24} />
              ) : game.exploded !== null ? (
                <Frown size={24} />
              ) : (
                <Smile size={24} />
              )}
            </button>
            <button aria-label="Flag mode" aria-pressed={flagMode} onClick={() => setFlagMode(!flagMode)}>
              <Flag size={18} />
            </button>
          </div>
          <div className="mine-grid" role="grid" aria-label="Minesweeper board">
            {Array.from({ length: SIDE }, (_, row) => (
              <div role="row" key={row}>
                {Array.from({ length: SIDE }, (_, column) => {
                  const i = row * SIDE + column,
                    open = game.opened.includes(i),
                    flagged = game.flags.includes(i),
                    mine = over && game.mines?.includes(i),
                    count = mineCount(game, i)
                  const state = mine
                    ? 'mine'
                    : flagged
                      ? 'flagged'
                      : open
                        ? `${count} nearby mines`
                        : 'hidden'
                  return (
                    <button
                      key={i}
                      ref={(node) => {
                        cells.current[i] = node
                      }}
                      role="gridcell"
                      className={`${open ? 'revealed' : ''} ${game.exploded === i ? 'exploded' : ''}`}
                      data-count={count}
                      aria-label={`Row ${row + 1}, column ${column + 1}, ${state}`}
                      aria-disabled={over || open}
                      tabIndex={focused === i ? 0 : -1}
                      onFocus={() => setFocused(i)}
                      onClick={() => setGame((g) => (flagMode ? flagMine(g, i) : revealMine(g, i)))}
                      onContextMenu={(event) => {
                        event.preventDefault()
                        setGame((g) => flagMine(g, i))
                      }}
                      onKeyDown={(event) => {
                        if (event.key.toLowerCase() === 'f') {
                          event.preventDefault()
                          setGame((g) => flagMine(g, i))
                          return
                        }
                        const next =
                          event.key === 'ArrowRight'
                            ? row * SIDE + Math.min(SIDE - 1, column + 1)
                            : event.key === 'ArrowLeft'
                              ? row * SIDE + Math.max(0, column - 1)
                              : event.key === 'ArrowDown'
                                ? Math.min(SIDE * SIDE - SIDE + column, i + SIDE)
                                : event.key === 'ArrowUp'
                                  ? Math.max(column, i - SIDE)
                                  : null
                        if (next !== null) {
                          event.preventDefault()
                          cells.current[next]?.focus()
                        }
                      }}
                    >
                      {mine ? <Bomb size={18} /> : flagged ? <Flag size={15} /> : open && count ? count : ''}
                    </button>
                  )
                })}
              </div>
            ))}
            {game.exploded !== null && !reducedMotion && (
              <span
                className="mine-explosion"
                aria-hidden="true"
                style={{
                  left: `${((game.exploded % SIDE) + 0.5) * (100 / SIDE)}%`,
                  top: `${(Math.floor(game.exploded / SIDE) + 0.5) * (100 / SIDE)}%`,
                }}
              />
            )}
          </div>
          <p className="mine-result" role="status">
            {won
              ? 'Board cleared.'
              : game.exploded !== null
                ? 'Mine hit. Start a new game.'
                : 'Find the 10 mines.'}
          </p>
          <p className="mine-help">Click or Enter to reveal. Right-click or F to flag. Arrow keys to move.</p>
          {!inline && (
            <button className="mine-return" onClick={onClose}>
              Back to setup
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
