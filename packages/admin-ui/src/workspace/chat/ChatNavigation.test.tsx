import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { ChatMenu } from './ChatMenu'
import { ChatHistorySearch } from './ChatHistorySearch'
import { workspaceApi } from '../workspace-api'

afterEach(() => vi.restoreAllMocks())

it('opens options from the keyboard, moves through actions and restores focus on Escape', async () => {
  render(
    <ChatMenu label="Chat options">
      <button>Preferences</button>
      <button>Hide history</button>
    </ChatMenu>
  )
  const trigger = screen.getByRole('button', { name: 'Chat options' })
  trigger.focus()
  await userEvent.keyboard('{Enter}')
  const menu = screen.getByRole('dialog', { name: 'Chat options' })
  expect(within(menu).getByRole('button', { name: 'Preferences' })).toHaveFocus()
  await userEvent.keyboard('{ArrowDown}')
  expect(within(menu).getByRole('button', { name: 'Hide history' })).toHaveFocus()
  await userEvent.keyboard('{Escape}')
  expect(menu).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

it('keeps options inside a narrow resized viewport and consumes the dismissing click', async () => {
  const action = vi.fn()
  render(
    <>
      <button onClick={action}>Behind menu</button>
      <ChatMenu label="Chat options">
        <button>Preferences</button>
      </ChatMenu>
    </>
  )
  await userEvent.click(screen.getByRole('button', { name: 'Chat options' }))
  const width = window.innerWidth,
    height = window.innerHeight
  Object.defineProperty(window, 'innerWidth', { value: 320, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: 240, configurable: true })
  act(() => window.dispatchEvent(new Event('resize')))
  const menu = screen.getByRole('dialog')
  expect(parseFloat(menu.style.left) + 236).toBeLessThanOrEqual(320)
  expect(parseFloat(menu.style.top) + parseFloat(menu.style.maxHeight)).toBeLessThanOrEqual(240)
  await userEvent.click(screen.getByRole('button', { name: 'Behind menu' }))
  expect(menu).not.toBeInTheDocument()
  expect(action).not.toHaveBeenCalled()
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true })
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true })
})

it('searches message text without replacing a newer search and opens a result', async () => {
  let complete!: (value: never) => void
  vi.spyOn(workspaceApi, 'execute').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve
      })
  )
  const open = vi.fn().mockResolvedValue(undefined),
    close = vi.fn()
  function Search() {
    const [query, setQuery] = useState('')
    return (
      <ChatHistorySearch
        recents={[{ id: 'saved', title: 'Saved conversation' }]}
        query={query}
        setQuery={setQuery}
        open={open}
        close={close}
      />
    )
  }
  render(<Search />)
  const input = screen.getByRole('textbox', { name: 'Search conversations' })
  expect(input).toHaveFocus()
  fireEvent.change(input, { target: { value: 'hidden text' } })
  await userEvent.click(screen.getByRole('button', { name: 'Search message text' }))
  fireEvent.change(input, { target: { value: 'does not match' } })
  await act(async () =>
    complete({ title: 'Saved conversation', messages: [{ content: 'hidden text' }] } as never)
  )
  expect(screen.queryByRole('button', { name: 'Saved conversation' })).not.toBeInTheDocument()
  fireEvent.change(input, { target: { value: 'Saved' } })
  await userEvent.click(screen.getByRole('button', { name: 'Saved conversation' }))
  await waitFor(() => expect(open).toHaveBeenCalledWith('saved'))
  expect(close).toHaveBeenCalledOnce()
})
