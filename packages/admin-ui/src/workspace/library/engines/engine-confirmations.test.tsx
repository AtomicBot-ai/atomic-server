import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { EngineBuilds } from './EngineBuilds'
import { EngineSettings } from './EngineSettings'

const settings = {
  'settings.get': { revision: 1, values: { ctx_size: 2048 } },
  'settings.schema': {
    descriptors: [
      {
        key: 'ctx_size',
        title: 'Context size',
        controllerType: 'input',
        controllerProps: { type: 'number' },
      },
    ],
  },
}
const service = {
  id: 'model',
  kind: 'chat' as const,
  provider: 'mlx',
  model: 'local-model',
  state: 'ready' as const,
  details: {},
}

it('removes only the confirmed engine build and keeps a failure inside its dialog', async () => {
  let fail = true
  const { workspace, execute } = workspaceFixture({
    'engines.list': {
      engines: [
        {
          engine: 'mlx',
          active_choice: 'client',
          builds: [{ version: 'v2', variant: 'cpu', removable: true }],
        },
      ],
    },
    'engines.remove': () => {
      if (fail) throw new Error('Build is in use')
      return {}
    },
  })
  render(<EngineBuilds provider="mlx" execute={workspace.execute} />)
  const trigger = await screen.findByRole('button', { name: 'Remove' })
  await userEvent.click(trigger)
  const dialog = screen.getByRole('dialog', { name: 'Remove engine build?' })
  expect(dialog).toHaveTextContent('MLX · v2 · cpu')
  expect(execute).not.toHaveBeenCalledWith('engines.remove', expect.anything())
  await userEvent.click(within(dialog).getByRole('button', { name: 'Remove build' }))
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Build is in use')
  fail = false
  await userEvent.click(within(dialog).getByRole('button', { name: 'Remove build' }))
  expect(execute).toHaveBeenCalledWith('engines.remove', { engine: 'mlx', version: 'v2', variant: 'cpu' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})

it('Escape from unsaved engine settings opens an in-app discard confirmation and Cancel retains edits', async () => {
  const { workspace } = workspaceFixture(settings)
  const close = vi.fn()
  render(<EngineSettings provider="mlx" workspace={workspace} onClose={close} />)
  const input = await screen.findByLabelText('Context size')
  await userEvent.clear(input)
  await userEvent.type(input, '4096')
  await userEvent.keyboard('{Escape}')
  const dialog = screen.getByRole('dialog', { name: 'Discard unsaved engine settings?' })
  expect(close).not.toHaveBeenCalled()
  await userEvent.keyboard('{Escape}')
  expect(dialog).not.toBeInTheDocument()
  expect(input).toHaveValue(4096)
  expect(input).toHaveFocus()
  await userEvent.click(screen.getByRole('button', { name: 'Close', exact: true }))
  await userEvent.click(
    within(screen.getByRole('dialog', { name: 'Discard unsaved engine settings?' })).getByRole('button', {
      name: 'Discard changes',
    })
  )
  expect(close).toHaveBeenCalledOnce()
})

it('retries only the failed load after a confirmed reload already unloaded the model', async () => {
  let fail = true
  const { workspace, execute } = workspaceFixture(
    {
      ...settings,
      'models.load': () => {
        if (fail) throw new Error('Not enough memory')
        return {}
      },
    },
    { services: [service] }
  )
  render(<EngineSettings provider="mlx" workspace={workspace} onClose={vi.fn()} />)
  await screen.findByLabelText('Context size')
  await userEvent.click(screen.getByText('Reload a model to apply saved settings'))
  await userEvent.click(screen.getByRole('button', { name: 'Reload local-model' }))
  const dialog = screen.getByRole('dialog', { name: 'Reload local-model?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Reload model' }))
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Not enough memory')
  fail = false
  await userEvent.click(within(dialog).getByRole('button', { name: 'Reload model' }))
  expect(execute.mock.calls.filter(([name]) => name === 'models.unload')).toHaveLength(1)
  expect(execute.mock.calls.filter(([name]) => name === 'models.load')).toHaveLength(2)
  expect(screen.getByText('Reloaded local-model with saved settings.')).toBeInTheDocument()
})

it('keeps a pending reload dialog mounted when shared state removes the unloaded service', async () => {
  let reject!: (error: Error) => void
  const pending = new Promise((_, fail) => {
    reject = fail
  })
  const close = vi.fn()
  const { workspace } = workspaceFixture(
    { ...settings, 'models.load': () => pending },
    { services: [service] }
  )
  const view = render(<EngineSettings provider="mlx" workspace={workspace} onClose={close} />)
  await screen.findByLabelText('Context size')
  await userEvent.click(screen.getByText('Reload a model to apply saved settings'))
  await userEvent.click(screen.getByRole('button', { name: 'Reload local-model' }))
  const dialog = screen.getByRole('dialog', { name: 'Reload local-model?' })
  await userEvent.click(within(dialog).getByRole('button', { name: 'Reload model' }))
  view.rerender(
    <EngineSettings
      provider="mlx"
      workspace={{ ...workspace, snapshot: { ...workspace.snapshot!, services: [] } }}
      onClose={close}
    />
  )
  expect(dialog).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  expect(close).not.toHaveBeenCalled()
  await act(async () => reject(new Error('Engine did not restart')))
  expect(within(dialog).getByRole('alert')).toHaveTextContent('Engine did not restart')
})
