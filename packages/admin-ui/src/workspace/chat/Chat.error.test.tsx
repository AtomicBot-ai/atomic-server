import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { workspaceApi } from '../workspace-api'
import { Chat } from './Chat'
import { DEFAULT_ATTACHMENTS } from '@contract'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

it.each([true, false])(
  'reveals a rejected first request and retains its draft (auto-scroll: %s)',
  async (autoScroll) => {
    localStorage.setItem('atomic:playground:preferences:v1', JSON.stringify({ autoScroll }))
    const execute = vi.spyOn(workspaceApi, 'execute').mockImplementation(async (name) => {
      if (name === 'chat.start')
        throw new Error('The engine ran out of memory. Reduce the context and retry.')
      return [] as never
    })
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    const { workspace } = workspaceFixture(
      {},
      {
        services: [
          {
            id: 'chat',
            provider: 'llamacpp-upstream',
            model: 'test-model',
            kind: 'chat',
            state: 'ready',
            details: {},
          },
        ],
      }
    )
    render(<Chat workspace={workspace} onCatalog={vi.fn()} />)
    await waitFor(() => expect(execute).toHaveBeenCalledWith('history.list'))
    const draft = screen.getByRole('textbox', { name: 'Message' })
    fireEvent.change(draft, { target: { value: 'Keep this request when it fails.' } })
    scroll.mockClear()
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The engine ran out of memory.')
    expect(draft).toHaveValue('Keep this request when it fails.')
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    expect(scroll).toHaveBeenCalledWith({ block: 'end' })
  }
)

it('offers one New chat action and ordinary conversation copy with history shown or hidden', async () => {
  localStorage.setItem('atomic:playground:preferences:v1', JSON.stringify({ sidebar: true }))
  vi.spyOn(workspaceApi, 'execute').mockResolvedValue([] as never)
  const { workspace } = workspaceFixture({})
  render(<Chat workspace={workspace} onCatalog={vi.fn()} />)
  expect(screen.getByRole('heading', { name: 'How can I help you today?' })).toBeInTheDocument()
  expect(screen.queryByText(/Send a test message/)).not.toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /New chat/ })).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: 'Chat options' }))
  await userEvent.click(screen.getByRole('button', { name: 'Hide history' }))
  await userEvent.keyboard('{Escape}')
  expect(screen.getAllByRole('button', { name: 'New chat' })).toHaveLength(1)
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'A draft' } })
  await userEvent.click(screen.getByRole('button', { name: 'New chat' }))
  await waitFor(() => expect(screen.getByLabelText('Message')).toHaveValue(''))
})

it('starts a fresh conversation with a skill selected and clears it on New chat', async () => {
  vi.spyOn(workspaceApi, 'execute').mockResolvedValue([] as never)
  const { workspace } = workspaceFixture(
    {},
    {
      features: {
        assistants: [],
        default_assistant: '',
        connectors: [],
        connector_status: {},
        attachments: DEFAULT_ATTACHMENTS,
        skills: [
          { name: 'review', description: '', body: 'Review the changes.', enabled: true, updated_at: 1 },
        ],
      },
    }
  )
  const consumed = vi.fn()
  const view = render(
    <Chat workspace={workspace} onCatalog={vi.fn()} trySkill="review" onSkillStarted={consumed} />
  )
  await waitFor(() => expect(consumed).toHaveBeenCalled())
  view.rerender(<Chat workspace={workspace} onCatalog={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Assistant and tools' }))
  expect(screen.getByRole('checkbox', { name: 'review' })).toBeChecked()
  await userEvent.keyboard('{Escape}')
  await userEvent.click(screen.getByRole('button', { name: /New chat/ }))
  expect(screen.getByLabelText('Message')).toHaveValue('')
  await userEvent.click(screen.getByRole('button', { name: 'Assistant and tools' }))
  expect(screen.getByRole('checkbox', { name: 'review' })).not.toBeChecked()
})
