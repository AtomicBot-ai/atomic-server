import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { useChatSession } from './useChatSession'
import { ChatTurnStatus } from './ChatTurnStatus'

const session = { busy: false, error: 'Provider unavailable', job: {} } as ReturnType<typeof useChatSession>
const prompt = { role: 'user', content: 'Explain this' }

it.each(['', '  ', [{ type: 'text', text: '' }]])(
  'retries an empty failed answer without a continuation prompt (%j)',
  async (content) => {
    const generate = vi.fn(async () => {})
    render(
      <ChatTurnStatus
        session={session}
        messages={[prompt, { role: 'assistant', content }]}
        bindings={[]}
        serviceReady
        generate={generate}
        onCatalog={vi.fn()}
      />
    )
    expect(screen.queryByRole('button', { name: 'Continue answer' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry answer' }))
    expect(generate).toHaveBeenCalledWith([prompt])
  }
)

it('continues a real partial answer and preserves that answer in the request', async () => {
  const generate = vi.fn(async () => {})
  const messages = [prompt, { role: 'assistant', content: 'The first part' }]
  render(
    <ChatTurnStatus
      session={session}
      messages={messages}
      bindings={[]}
      serviceReady
      generate={generate}
      onCatalog={vi.fn()}
    />
  )
  expect(screen.queryByRole('button', { name: 'Retry answer' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Continue answer' }))
  expect(generate).toHaveBeenCalledWith([
    ...messages,
    {
      role: 'user',
      content: 'Continue your previous answer from where you stopped.',
    },
  ])
})
