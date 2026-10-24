import { render, screen, fireEvent } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { IntroScreen } from './IntroScreen'

it('focuses the entry button and consumes the first key without forwarding it', () => {
  const enter = vi.fn(),
    leaked = vi.fn()
  window.addEventListener('keydown', leaked)
  const ui = render(<IntroScreen onContinue={enter} />)
  expect(screen.getByRole('main', { name: 'Atomic Server intro' })).toBeVisible()
  expect(screen.getByRole('heading', { name: 'Atomic Server' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Press any key' })).toHaveFocus()
  fireEvent.keyDown(window, { key: 'x' })
  expect(enter).toHaveBeenCalledOnce()
  expect(leaked).not.toHaveBeenCalled()
  fireEvent.keyDown(window, { key: 'x' })
  expect(enter).toHaveBeenCalledOnce()
  ui.unmount()
  window.removeEventListener('keydown', leaked)
})
it('supports clicking while leaving browser shortcuts and modifier keys alone', () => {
  const enter = vi.fn()
  render(<IntroScreen onContinue={enter} />)
  fireEvent.keyDown(window, { key: 'Shift' })
  fireEvent.keyDown(window, { key: 'r', ctrlKey: true })
  expect(enter).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Press any key' }))
  expect(enter).toHaveBeenCalledOnce()
})
