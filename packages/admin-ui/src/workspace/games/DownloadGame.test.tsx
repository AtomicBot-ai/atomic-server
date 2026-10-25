import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { DownloadGame } from './DownloadGame'
import { placeMines, SIDE } from './mines'
import { useDialog } from '../useDialog'

it('supports flagging, safe reveal, keyboard movement and restart', async () => {
  render(<DownloadGame onClose={vi.fn()} />)
  const first = screen.getByRole('gridcell', { name: 'Row 1, column 1, hidden' })
  await userEvent.click(screen.getByRole('button', { name: 'Flag mode' }))
  await userEvent.click(first)
  expect(first).toHaveAccessibleName('Row 1, column 1, flagged')
  expect(screen.getByLabelText('Mines left')).toHaveTextContent('009')
  fireEvent.contextMenu(first)
  expect(first).toHaveAccessibleName('Row 1, column 1, hidden')
  await userEvent.click(screen.getByRole('button', { name: 'Flag mode' }))
  await userEvent.click(first)
  expect(first).toHaveAccessibleName('Row 1, column 1, 0 nearby mines')
  await userEvent.keyboard('{ArrowRight}')
  expect(screen.getByRole('gridcell', { name: /^Row 1, column 2,/ })).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: 'New game' }))
  expect(screen.getAllByRole('gridcell', { name: /hidden$/ })).toHaveLength(64)
  expect(screen.getByRole('button', { name: 'Flag mode' })).toHaveAttribute('aria-pressed', 'false')
})

it('updates download status without interrupting the game or closing setup', async () => {
  const onClose = vi.fn()
  const { rerender } = render(<DownloadGame onClose={onClose} status="Downloading Qwen · 30%" />)
  await userEvent.click(screen.getByRole('button', { name: 'Flag mode' }))
  await userEvent.click(screen.getByRole('gridcell', { name: 'Row 1, column 1, hidden' }))
  rerender(<DownloadGame onClose={onClose} status="Model downloaded. Close the game to continue." />)
  expect(screen.getByText('Model downloaded. Close the game to continue.')).toBeInTheDocument()
  expect(screen.getByRole('gridcell', { name: 'Row 1, column 1, flagged' })).toBeInTheDocument()
  expect(onClose).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Back to setup' }))
  expect(onClose).toHaveBeenCalledOnce()
})

it('Escape closes only the game and returns focus to its launch action', async () => {
  function Setup() {
    const [open, setOpen] = useState(false)
    return (
      <section role="dialog" aria-modal="true" aria-label="Connect agent">
        <button onClick={() => setOpen(true)}>Play while waiting</button>
        {open && <DownloadGame onClose={() => setOpen(false)} />}
      </section>
    )
  }
  render(<Setup />)
  const play = screen.getByRole('button', { name: 'Play while waiting' })
  await userEvent.click(play)
  expect(screen.getByRole('dialog', { name: 'Minesweeper' })).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: 'Minesweeper' })).not.toBeInTheDocument()
  expect(screen.getByRole('dialog', { name: 'Connect agent' })).toBeInTheDocument()
  expect(play).toHaveFocus()
})

it('returns focus to setup when download completion removes the game launch button', async () => {
  const rects = vi
    .spyOn(HTMLElement.prototype, 'getClientRects')
    .mockReturnValue([{}] as unknown as DOMRectList)
  function Setup({ ready }: { ready: boolean }) {
    const [open, setOpen] = useState(false)
    const parent = useDialog(vi.fn())
    return (
      <>
        <button>Background navigation</button>
        <section ref={parent} role="dialog" aria-modal="true" aria-label="Connect agent" tabIndex={-1}>
          {!ready && <button onClick={() => setOpen(true)}>Play while waiting</button>}
          <button disabled={!ready}>Configure &amp; start</button>
          {open && <DownloadGame onClose={() => setOpen(false)} />}
        </section>
      </>
    )
  }
  try {
    const view = render(<Setup ready={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Play while waiting' }))
    view.rerender(<Setup ready />)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Minesweeper' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Connect agent' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Configure & start' })).toHaveFocus()
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Configure & start' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Background navigation' })).not.toHaveFocus()
  } finally {
    rects.mockRestore()
  }
})

it('expands a mine-hit burst from the hit cell inside the board and clears it on restart', async () => {
  const random = vi.spyOn(Math, 'random').mockReturnValue(0)
  try {
    render(<DownloadGame inline onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('gridcell', { name: 'Row 1, column 1, hidden' }))
    const cell = placeMines(0, () => 0)[0]!
    const row = Math.floor(cell / SIDE),
      column = cell % SIDE
    await userEvent.click(
      screen.getByRole('gridcell', { name: `Row ${row + 1}, column ${column + 1}, hidden` })
    )
    const board = screen.getByRole('grid', { name: 'Minesweeper board' })
    const burst = board.querySelector('.mine-explosion')
    expect(burst).toHaveAttribute('aria-hidden', 'true')
    expect(burst).toHaveStyle({ left: `${(column + 0.5) * 12.5}%`, top: `${(row + 0.5) * 12.5}%` })
    expect(screen.getByText('Mine hit. Start a new game.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'New game' }))
    expect(board.querySelector('.mine-explosion')).toBeNull()
  } finally {
    random.mockRestore()
  }
})

it('keeps the loss state without a burst when reduced motion is requested', async () => {
  const random = vi.spyOn(Math, 'random').mockReturnValue(0)
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true }))
  )
  try {
    render(<DownloadGame inline onClose={vi.fn()} />)
    await userEvent.click(screen.getByRole('gridcell', { name: 'Row 1, column 1, hidden' }))
    const cell = placeMines(0, () => 0)[0]!
    await userEvent.click(
      screen.getByRole('gridcell', {
        name: `Row ${Math.floor(cell / SIDE) + 1}, column ${(cell % SIDE) + 1}, hidden`,
      })
    )
    expect(screen.getByText('Mine hit. Start a new game.')).toBeInTheDocument()
    expect(
      screen.getByRole('grid', { name: 'Minesweeper board' }).querySelector('.mine-explosion')
    ).toBeNull()
  } finally {
    random.mockRestore()
    vi.unstubAllGlobals()
  }
})
