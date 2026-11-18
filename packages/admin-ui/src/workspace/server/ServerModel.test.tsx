import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { enginesList, workspaceFixture } from '@/test/workspace-fixture'
import { ServerModel } from './ServerModel'

it('offers registered local engines when the current cloud provider is not in the picker', async () => {
  const { workspace } = workspaceFixture(
    {
      'engines.list': enginesList(['llamacpp-upstream', 'mlx']),
      'models.installed': [],
    },
    {
      services: [
        {
          id: 'chat',
          kind: 'chat',
          provider: 'openrouter',
          model: 'cloud-model',
          state: 'ready',
          details: {},
        },
      ],
    }
  )
  render(<ServerModel workspace={workspace} openModels={vi.fn()} />)
  expect(await screen.findByText('Select engine')).toBeInTheDocument()
  expect(screen.queryByText('No engines available')).not.toBeInTheDocument()
  await userEvent.click(screen.getByLabelText('Inference engine'))
  await userEvent.click(screen.getByRole('option', { name: /MLX/ }))
  expect(screen.getByLabelText('Inference engine')).toHaveValue('mlx')
})

it('reserves the empty-engine message for a genuinely empty list', async () => {
  const { workspace } = workspaceFixture({ 'engines.list': enginesList([]), 'models.installed': [] })
  render(<ServerModel workspace={workspace} openModels={vi.fn()} />)
  expect(await screen.findByText('No engines available')).toBeInTheDocument()
})

it('shows Strata model loading and success in the same status', async () => {
  let finishLoad!: () => void
  const loading = new Promise<void>((resolve) => (finishLoad = resolve))
  const { workspace, execute } = workspaceFixture({
    'engines.list': enginesList(['strata', 'sglang']),
    'models.installed': [{ id: 'qwen36-q4', providers: ['strata'] }],
    'models.load': async () => {
      await loading
      workspace.snapshot!.services = [
        { id: 'chat', kind: 'chat', provider: 'strata', model: 'qwen36-q4', state: 'ready', details: {} },
      ]
    },
  })
  render(<ServerModel workspace={workspace} openModels={vi.fn()} />)
  const engine = await screen.findByRole('combobox', { name: 'Inference engine' })
  await userEvent.click(engine)
  expect(screen.getByRole('option', { name: 'SGLang' }).querySelector('img')).toHaveAttribute(
    'src',
    '/engine-brands/sglang.svg'
  )
  await userEvent.click(screen.getByRole('option', { name: 'Strata' }))
  expect(engine.querySelector('.engine-mark')).toHaveTextContent('S')
  await userEvent.click(screen.getByRole('button', { name: 'Load model' }))
  expect(execute).toHaveBeenCalledWith('models.load', { provider: 'strata', model_id: 'qwen36-q4' })
  const status = screen.getByRole('status')
  expect(status).toHaveTextContent('Loading model…')
  finishLoad()
  await screen.findByText('Loaded', { exact: true })
  expect(status).toHaveTextContent(/^Loaded$/)
})
