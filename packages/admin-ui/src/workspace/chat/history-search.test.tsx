import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceApi } from '../workspace-api'
import { ChatHistorySearch } from './ChatHistorySearch'
it.each(['content', 'role', 'atomic_meta'])(
  'does not match JSON metadata %s in message text search',
  async (query) => {
    vi.spyOn(workspaceApi, 'execute').mockResolvedValue({
      title: 'Example',
      messages: [
        { role: 'user', content: 'HELLO_879' },
        { role: 'assistant', content: 'WORLD_321', atomic_meta: { model: 'hidden' } },
      ],
    })
    render(
      <ChatHistorySearch
        recents={[{ id: 'a', title: 'Example' }]}
        query={query}
        setQuery={vi.fn()}
        open={vi.fn()}
        close={vi.fn()}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Search message text' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Example' })).not.toBeInTheDocument())
  }
)
