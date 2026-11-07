import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { ConnectionGuide } from './ConnectionGuide'

it.each([true, false])('connects without restarting the unchanged API (running=%s)', async (running) => {
  const { workspace, execute } = workspaceFixture({
    'models.installed': [{ id: 'qwen', name: 'Qwen', providers: ['llamacpp-upstream'] }],
    'keys.list': [{ id: 'key' }],
    'connection.info': { endpoint: 'http://127.0.0.1:1339/v1' },
    'api.restart': () => {
      throw new Error('Port is still held by the engine process')
    },
  })
  workspace.snapshot!.api = { ...workspace.snapshot!.api, running, port: 1339 }
  render(
    <ConnectionGuide workspace={workspace} initialAgent="poolside" onClose={vi.fn()} onSettings={vi.fn()} />
  )
  expect(screen.queryByText(/Applying this connection restarts/)).not.toBeInTheDocument()
  await userEvent.click(await screen.findByRole('button', { name: 'Configure & start' }))
  expect(await screen.findByRole('heading', { name: 'Poolside connection is ready' })).toBeInTheDocument()
  expect(execute).toHaveBeenCalledWith('api.start', { request: { host: '127.0.0.1', port: 1339 } })
  expect(execute).not.toHaveBeenCalledWith('api.restart', expect.anything())
})

it('restarts and warns when the user chooses another port', async () => {
  const { workspace, execute } = workspaceFixture({
    'models.installed': [{ id: 'qwen', name: 'Qwen', providers: ['llamacpp-upstream'] }],
    'keys.list': [{ id: 'key' }],
    'connection.info': { endpoint: 'http://127.0.0.1:1777/v1' },
  })
  render(<ConnectionGuide workspace={workspace} onClose={vi.fn()} onSettings={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: /Configure an endpoint/ }))
  await userEvent.clear(screen.getByLabelText('Server port'))
  await userEvent.type(screen.getByLabelText('Server port'), '1777')
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  expect(screen.getByText(/Applying this connection restarts/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Configure & start' }))
  await screen.findByRole('button', { name: 'Copy endpoint' })
  expect(execute).toHaveBeenCalledWith('api.restart', { request: { host: '127.0.0.1', port: 1777 } })
})
