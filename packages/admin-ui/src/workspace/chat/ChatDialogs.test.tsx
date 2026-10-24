import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { workspaceApi } from '../workspace-api'
import { CHAT_DEFAULTS } from './chat-preferences'
import { ChatHistory } from './ChatHistory'
import { ChatToolbar } from './ChatToolbar'
import type { useChatSession } from './useChatSession'

function session(): ReturnType<typeof useChatSession> {
  return {
    chat: { id: 'first', title: 'Original title', messages: [] },
    job: {},
    busy: false,
    error: '',
    recents: [],
    tabs: [],
    setError: vi.fn(),
    setTabs: vi.fn(),
    open: vi.fn().mockResolvedValue(undefined),
    save: vi.fn().mockResolvedValue({}),
    generate: vi.fn(),
    stop: vi.fn(),
    fresh: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
  }
}

afterEach(() => vi.restoreAllMocks())

it('renames with keyboard and retains a failed draft while locking duplicate submissions and Escape', async () => {
  const s = session()
  let reject!: (error: Error) => void
  vi.mocked(s.save).mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail
      })
  )
  render(<ChatToolbar session={s} preferences={CHAT_DEFAULTS} save={vi.fn()} openSettings={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Conversation actions' }))
  const trigger = screen.getByRole('button', { name: 'Rename' })
  await userEvent.click(trigger)
  const input = screen.getByRole('textbox', { name: 'Conversation title' })
  expect(input).toHaveFocus()
  await userEvent.clear(input)
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  await userEvent.type(input, 'Revised title{Enter}')
  await waitFor(() => expect(s.save).toHaveBeenCalledOnce())
  expect(s.save).toHaveBeenCalledWith({ ...s.chat, title: 'Revised title' })
  expect(screen.getByRole('dialog', { name: /Rename conversation|Import 1 conversation/ })).toHaveAttribute(
    'aria-busy',
    'true'
  )
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  fireEvent.submit(input.closest('form')!)
  await userEvent.keyboard('{Escape}')
  expect(
    screen.getByRole('dialog', { name: /Rename conversation|Import 1 conversation/ })
  ).toBeInTheDocument()
  expect(s.save).toHaveBeenCalledOnce()
  await act(async () => reject(new Error('The conversation could not be saved.')))
  expect(await screen.findByRole('alert')).toHaveTextContent('The conversation could not be saved.')
  expect(input).toHaveValue('Revised title')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: /Rename conversation|Import 1 conversation/ })
    ).not.toBeInTheDocument()
  )
  expect(s.save).toHaveBeenCalledTimes(2)
  expect(trigger).toHaveFocus()
})

it('Escape cancels a rename without saving and returns focus to Rename', async () => {
  const s = session()
  render(<ChatToolbar session={s} preferences={CHAT_DEFAULTS} save={vi.fn()} openSettings={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Conversation actions' }))
  const trigger = screen.getByRole('button', { name: 'Rename' })
  await userEvent.click(trigger)
  await userEvent.keyboard('{Escape}')
  expect(
    screen.queryByRole('dialog', { name: /Rename conversation|Import 1 conversation/ })
  ).not.toBeInTheDocument()
  expect(s.save).not.toHaveBeenCalled()
  expect(trigger).toHaveFocus()
})

async function chooseImport(s: ReturnType<typeof useChatSession>) {
  render(<ChatHistory session={s} />)
  await userEvent.click(screen.getByRole('button', { name: 'History options' }))
  await userEvent.click(screen.getByText('Import / export'))
  const input = screen.getByLabelText('Import conversations (JSON / JSONL)')
  const file = new File(['unused'], 'conversations.json', { type: 'application/json' })
  Object.defineProperty(file, 'text', {
    value: async () => JSON.stringify([{ title: 'Imported', messages: [] }]),
  })
  await userEvent.upload(input, file)
  await screen.findByRole('dialog', { name: 'Import 1 conversation?' })
  return input
}

it('Escape cancels an import before mutation and returns focus to the file control', async () => {
  const execute = vi.spyOn(workspaceApi, 'execute')
  const input = await chooseImport(session())
  await userEvent.keyboard('{Escape}')
  expect(
    screen.queryByRole('dialog', { name: /Rename conversation|Import 1 conversation/ })
  ).not.toBeInTheDocument()
  expect(execute).not.toHaveBeenCalled()
  expect(input).toBeEnabled()
  expect(input).toHaveFocus()
})

it('keeps import failures in the dialog and prevents duplicates while a request is pending', async () => {
  const s = session()
  let reject!: (error: Error) => void
  const execute = vi
    .spyOn(workspaceApi, 'execute')
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        })
    )
    .mockResolvedValueOnce({ ids: ['imported'] } as never)
  const input = await chooseImport(s)
  await userEvent.click(screen.getByRole('button', { name: 'Import' }))
  await waitFor(() => expect(execute).toHaveBeenCalledOnce())
  expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await userEvent.keyboard('{Escape}')
  expect(
    screen.getByRole('dialog', { name: /Rename conversation|Import 1 conversation/ })
  ).toBeInTheDocument()
  await act(async () => reject(new Error('The import could not be saved.')))
  expect(await screen.findByRole('alert')).toHaveTextContent('The import could not be saved.')
  await userEvent.click(screen.getByRole('button', { name: 'Import' }))
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: /Rename conversation|Import 1 conversation/ })
    ).not.toBeInTheDocument()
  )
  expect(execute).toHaveBeenCalledTimes(2)
  expect(s.open).toHaveBeenCalledWith('imported')
  expect(input).toHaveFocus()
})

it('retries a failed refresh without importing the same conversations twice', async () => {
  const s = session()
  const execute = vi.spyOn(workspaceApi, 'execute').mockResolvedValue({ ids: ['imported'] } as never)
  vi.mocked(s.refresh).mockRejectedValueOnce(new Error('The conversation list could not be refreshed.'))
  await chooseImport(s)
  await userEvent.click(screen.getByRole('button', { name: 'Import' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('The conversation list could not be refreshed.')
  expect(s.open).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Import' }))
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: /Rename conversation|Import 1 conversation/ })
    ).not.toBeInTheDocument()
  )
  expect(execute).toHaveBeenCalledOnce()
  expect(s.refresh).toHaveBeenCalledTimes(2)
  expect(s.open).toHaveBeenCalledOnce()
})
