import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { InstalledLoad } from './InstalledLoad'
import { workspaceApi } from '../workspace-api'
afterEach(() => vi.restoreAllMocks())
it('searches downloaded models and loads the exact engine directly from its row', async () => {
  const execute = vi.spyOn(workspaceApi, 'execute').mockImplementation(async (name) =>
    name === 'models.installed'
      ? [
          { id: 'qwen', name: 'Qwen', providers: ['vllm', 'tensorrt-llm'] },
          { id: 'other', name: 'Other', provider: 'mlx' },
        ]
      : {}
  )
  render(<InstalledLoad disabled={false} query="tensorrt" models={[]} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Load Qwen with TensorRT-LLM' }))
  expect(screen.queryByText('Other')).not.toBeInTheDocument()
  expect(execute).toHaveBeenCalledWith('models.load', { provider: 'tensorrt-llm', model_id: 'qwen' })
})
it('locks loading actions until completion and keeps a failure visible for retry', async () => {
  let reject!: (error: Error) => void
  const execute = vi.spyOn(workspaceApi, 'execute').mockImplementation(async (name) =>
    name === 'models.installed'
      ? [{ id: 'qwen', name: 'Qwen', provider: 'mlx' }]
      : new Promise((_, fail) => {
          reject = fail
        })
  )
  render(<InstalledLoad disabled={false} query="" models={[]} />)
  const button = await screen.findByRole('button', { name: 'Load Qwen with MLX' })
  await userEvent.click(button)
  expect(button).toBeDisabled()
  expect(button).toHaveTextContent('Loading…')
  await act(async () => reject(new Error('Not enough memory.')))
  expect(await screen.findByRole('alert')).toHaveTextContent('Not enough memory.')
  expect(button).toBeEnabled()
  expect(execute.mock.calls.filter(([name]) => name === 'models.load')).toHaveLength(1)
})

it('exposes a failed downloaded-model read and retries without showing loaded duplicates', async () => {
  vi.spyOn(workspaceApi, 'execute')
    .mockRejectedValueOnce(new Error('Server unavailable.'))
    .mockResolvedValueOnce([{ id: 'qwen', name: 'Qwen', providers: ['mlx', 'vllm'] }] as never)
  render(
    <InstalledLoad
      disabled={false}
      models={[
        { id: 'ready', model: 'qwen', provider: 'mlx', state: 'ready', kind: 'chat', details: {} } as never,
      ]}
    />
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('Server unavailable.')
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('button', { name: 'Load Qwen with vLLM' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: 'Load Qwen with MLX' })).not.toBeInTheDocument()
})
