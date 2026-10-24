import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { workspaceApi } from '../workspace-api'
import { Chat } from './Chat'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

it.each(['llamacpp-upstream', 'openai'])(
  'sends to a ready %s model without demanding another download',
  async (provider) => {
    const execute = vi.spyOn(workspaceApi, 'execute').mockImplementation(async (name) => {
      if (name === 'chat.start')
        return {
          id: 'job',
          conversation_id: 'conversation',
          model: 'selected-model',
          state: 'complete',
          message: { role: 'assistant', content: 'Ready answer' },
        } as never
      return [] as never
    })
    const { workspace } = workspaceFixture(
      {},
      {
        services: [
          { id: 'selected', provider, model: 'selected-model', kind: 'chat', state: 'ready', details: {} },
        ],
      }
    )
    const view = render(<Chat workspace={workspace} onCatalog={vi.fn()} />)
    await waitFor(() => expect(execute).toHaveBeenCalledWith('history.list'))
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'A question' } })
    expect(screen.queryByText('Choose and download a model to continue.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('Ready answer')).toBeInTheDocument()
    expect(execute).toHaveBeenCalledWith(
      'chat.start',
      expect.objectContaining({
        provider,
        request: expect.objectContaining({
          model: 'selected-model',
          messages: [{ role: 'user', content: 'A question' }],
        }),
      })
    )
    workspace.snapshot!.api.running = false
    view.rerender(<Chat workspace={workspace} onCatalog={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Keep this draft' } })
    expect(screen.queryByText('Start the server to send a message.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    execute.mockClear()
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(screen.getByText('Start the server to send a message.')).toBeInTheDocument()
    expect(execute).not.toHaveBeenCalledWith('chat.start', expect.anything())
    expect(screen.getByLabelText('Message')).toHaveValue('Keep this draft')
  }
)

it('opens model selection on Send without losing the draft or duplicating acquisition actions', async () => {
  const execute = vi.spyOn(workspaceApi, 'execute').mockResolvedValue([] as never)
  const { workspace } = workspaceFixture({}, { services: [] })
  render(<Chat workspace={workspace} onCatalog={vi.fn()} />)
  await waitFor(() => expect(execute).toHaveBeenCalledWith('history.list'))
  fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Keep my question' } })
  expect(screen.queryByText('Choose and download a model to continue.')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Load a model' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
  expect(screen.getByRole('dialog', { name: 'Chat model' })).toBeInTheDocument()
  expect(screen.getByText('Choose and download a model to continue.')).toBeInTheDocument()
  expect(screen.getByLabelText('Message')).toHaveValue('Keep my question')
  expect(screen.getAllByRole('button', { name: 'Manage models' })).toHaveLength(1)
  expect(execute).not.toHaveBeenCalledWith('chat.start', expect.anything())
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: 'Chat model' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Message')).toHaveValue('Keep my question')
})

it('explains a pending download on Send without leaving chat or preparing attachments', async () => {
  const execute = vi.spyOn(workspaceApi, 'execute').mockResolvedValue([] as never)
  const { workspace } = workspaceFixture(
    {},
    {
      services: [],
      setups: [
        {
          id: 'pending',
          stage: 'downloading',
          plan: { model_id: 'selected-model', provider: 'llamacpp-upstream' },
          progress: { transferred: 100, total: 1000 },
        },
      ],
    }
  )
  const acquire = vi.fn()
  window.addEventListener('atomic:acquire', acquire)
  try {
    render(<Chat workspace={workspace} onCatalog={vi.fn()} />)
    await waitFor(() => expect(execute).toHaveBeenCalledWith('history.list'))
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Wait for my model' } })
    expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(screen.getByText('The model is downloading. Wait until it is ready.')).toBeInTheDocument()
    expect(screen.getByLabelText('Message')).toHaveValue('Wait for my model')
    expect(screen.queryByRole('dialog', { name: 'Chat model' })).not.toBeInTheDocument()
    expect(execute).not.toHaveBeenCalledWith('chat.start', expect.anything())
    expect(acquire).not.toHaveBeenCalled()
  } finally {
    window.removeEventListener('atomic:acquire', acquire)
  }
})
