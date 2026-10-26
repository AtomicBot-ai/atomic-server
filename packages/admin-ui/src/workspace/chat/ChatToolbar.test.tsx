import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { CHAT_DEFAULTS } from './chat-preferences'
import { ChatToolbar } from './ChatToolbar'
import type { useChatSession } from './useChatSession'

it('draws no conversation title or tab strip above an open conversation', () => {
  const chat = { id: 'first', title: 'hi there', messages: [] }
  const s = {
    chat,
    job: {},
    busy: false,
    error: '',
    recents: [chat],
    setError: vi.fn(),
    open: vi.fn(),
    save: vi.fn(),
    generate: vi.fn(),
    stop: vi.fn(),
    fresh: vi.fn(),
    refresh: vi.fn(),
  } as unknown as ReturnType<typeof useChatSession>
  render(<ChatToolbar session={s} preferences={CHAT_DEFAULTS} save={vi.fn()} openSettings={vi.fn()} />)
  expect(screen.queryByText('hi there')).not.toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: 'Open conversations' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Conversation actions' })).toBeInTheDocument()
})
