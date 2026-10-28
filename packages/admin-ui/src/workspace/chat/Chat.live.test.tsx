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

// A turn the terminal runs is a server job: the snapshot names it, and the open chat follows its reply.
it('streams a reply the terminal is generating in the open chat, then keeps the saved one', async () => {
  const chat = {
    id: 'shared',
    title: 'Shared chat',
    endpoint: '',
    model: 'local-model',
    createdAt: 1,
    updatedAt: 1,
    interrupted: false,
    messages: [{ role: 'user', content: 'Reply with LIVE-99.' }],
  }
  let progress: Record<string, unknown> = {
    id: 'job-1',
    conversation_id: 'shared',
    model: 'local-model',
    state: 'generating',
    message: { role: 'assistant', content: 'Streaming from the terminal' },
  }
  let saved: unknown = chat
  vi.spyOn(workspaceApi, 'execute').mockImplementation((async (operation: string) => {
    if (operation === 'history.list') return [{ ...chat, turns: 1 }]
    if (operation === 'history.load') return saved
    if (operation === 'chat.progress') return progress
    return []
  }) as never)
  const { workspace } = workspaceFixture({})
  const view = render(<Chat workspace={workspace} onCatalog={vi.fn()} />)
  fireEvent.click(await screen.findByText('Shared chat'))
  await screen.findByText('Reply with LIVE-99.')
  view.rerender(
    <Chat
      workspace={{
        ...workspace,
        snapshot: {
          ...workspace.snapshot!,
          chats: [{ id: 'job-1', conversation_id: 'shared', state: 'generating' }],
        },
      }}
      onCatalog={vi.fn()}
    />
  )
  await screen.findByText('Streaming from the terminal')
  const final = { role: 'assistant', content: 'LIVE-99 acknowledged' }
  saved = { ...chat, messages: [...chat.messages, final] }
  progress = { ...progress, state: 'complete', message: final }
  await screen.findByText('LIVE-99 acknowledged', {}, { timeout: 4500 })
}, 15000)

it('opens another chat while following a reply the terminal is generating', async () => {
  const shared = {
    id: 'shared',
    title: 'Shared chat',
    endpoint: '',
    model: 'm',
    createdAt: 1,
    updatedAt: 1,
    interrupted: false,
    messages: [{ role: 'user', content: 'Long question' }],
  }
  const other = {
    ...shared,
    id: 'other',
    title: 'Other chat',
    messages: [{ role: 'user', content: 'Elsewhere' }],
  }
  vi.spyOn(workspaceApi, 'execute').mockImplementation((async (
    operation: string,
    input?: { id?: string }
  ) => {
    if (operation === 'history.list') return [shared, other]
    if (operation === 'history.load') return input?.id === 'other' ? other : shared
    if (operation === 'chat.progress')
      return {
        id: 'job-1',
        conversation_id: 'shared',
        state: 'generating',
        message: { role: 'assistant', content: 'Still going' },
      }
    return []
  }) as never)
  const { workspace } = workspaceFixture({})
  const view = render(<Chat workspace={workspace} onCatalog={vi.fn()} />)
  fireEvent.click(await screen.findByText('Shared chat'))
  view.rerender(
    <Chat
      workspace={{
        ...workspace,
        snapshot: {
          ...workspace.snapshot!,
          chats: [{ id: 'job-1', conversation_id: 'shared', state: 'generating' }],
        },
      }}
      onCatalog={vi.fn()}
    />
  )
  await screen.findByText('Still going')
  fireEvent.click(screen.getByText('Other chat'))
  await screen.findByText('Elsewhere')
  expect(screen.queryByText('Still going')).toBeNull()
}, 15000)
