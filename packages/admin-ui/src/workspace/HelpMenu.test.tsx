import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { HelpMenu } from './HelpMenu'

it('uses the desktop support destinations and dismisses without activating the background', () => {
  const close = vi.fn(),
    outside = vi.fn()
  render(
    <>
      <button onClick={outside}>Background</button>
      <HelpMenu onClose={close} onCommands={vi.fn()} onSetup={vi.fn()} />
    </>
  )
  expect(screen.getByRole('dialog').parentElement).toHaveClass('modal-shade')
  expect(screen.getByRole('link', { name: 'Email support' })).toHaveAttribute(
    'href',
    'mailto:support@atomic.chat'
  )
  expect(screen.getByRole('link', { name: 'Discord' })).toHaveAttribute(
    'href',
    'https://discord.com/invite/FTk2MvZwJH'
  )
  expect(screen.getByRole('link', { name: 'New GitHub issue' })).toHaveAttribute(
    'href',
    'https://github.com/AtomicBot-ai/Atomic-Chat/issues/new'
  )
  fireEvent.click(screen.getByRole('button', { name: 'Background' }))
  expect(close).toHaveBeenCalledOnce()
  expect(outside).not.toHaveBeenCalled()
})
