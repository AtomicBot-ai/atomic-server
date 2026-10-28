import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { workspaceApi } from '../workspace-api'
import { Chat } from './Chat'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

// The terminal writes the same history: its chats, turns and deletions reach an open Playground without
// a reload, and the words typed here stay.
it('shows chats and turns another client saves, keeping the draft, and a deletion', async () => {
  const chat = {
    id: 'from-terminal',
    title: 'From the terminal',
    endpoint: '',
    model: 'local-model',
    createdAt: 1,
    updatedAt: 1,
    interrupted: false,
    messages: [
      { role: 'user', content: 'Reply with TUI-OK.' },
      { role: 'assistant', content: 'TUI-OK confirmed' },
    ],
  }
  let list: unknown[] = []
  let saved: unknown = chat
  vi.spyOn(workspaceApi, 'execute').mockImplementation((async (operation: string) => {
    if (operation === 'history.list') return list
    if (operation === 'history.load') return saved
    return []
  }) as never)
  const { workspace } = workspaceFixture({})
  render(<Chat workspace={workspace} onCatalog={vi.fn()} />)
  list = [{ ...chat, turns: 2 }]
  fireEvent.click(await screen.findByText('From the terminal', {}, { timeout: 4500 }))
  await screen.findByText('TUI-OK confirmed')
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'keep me' } })
  saved = {
    ...chat,
    updatedAt: 2,
    messages: [
      ...chat.messages,
      { role: 'user', content: 'Reply with LIVE-99.' },
      { role: 'assistant', content: 'LIVE-99 acknowledged' },
    ],
  }
  await screen.findByText('LIVE-99 acknowledged', {}, { timeout: 4500 })
  expect(screen.getByLabelText('Message')).toHaveValue('keep me')
  saved = null
  list = []
  await waitFor(() => expect(screen.queryByText('LIVE-99 acknowledged')).toBeNull(), { timeout: 4500 })
  expect(screen.getByLabelText('Message')).toHaveValue('keep me')
}, 15000)
