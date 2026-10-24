import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { SETUP_GOALS, SERVER_SETTINGS_GROUPS } from '@contract'
import type { Workspace } from '../useWorkspace'
import { SetupReady } from '../setup/SetupReady'
import { RuntimeSettings } from './RuntimeSettings'
import { ServiceConnections } from './ServiceConnections'
import { ConnectionSteps } from './ConnectionSteps'

it.each(SETUP_GOALS)('finishes $label at server connections', async (goal) => {
  const open = vi.fn()
  render(<SetupReady goal={goal.id} endpoint="http://localhost:1337/v1" onOpenGoal={open} />)
  await userEvent.click(screen.getByRole('button', { name: 'Open server connections' }))
  expect(open).toHaveBeenCalledWith(goal.id)
  expect(goal.destination).toBe('server')
})

it('keeps startup models and container settings editable in their own sections', async () => {
  const execute = vi.fn(async (name: string) =>
    name === 'config.get'
      ? {
          values: { models: { autoLoad: [] }, managed: { mode: 'off' } },
          fields: [
            { path: 'models.autoLoad', description: 'Models on start' },
            { path: 'managed.mode', values: ['off', 'docker-tensorrt'] },
          ],
        }
      : {}
  )
  const workspace = { execute } as unknown as Workspace
  const { rerender } = render(<RuntimeSettings workspace={workspace} section="models" />)
  await userEvent.type(await screen.findByLabelText(/Models to load on start/), 'first, second')
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith('config.update', {
      values: { 'models.autoLoad': ['first', 'second'] },
    })
  )
  rerender(<RuntimeSettings workspace={workspace} section="managed" />)
  await userEvent.selectOptions(await screen.findByLabelText('Container runtime'), 'docker-tensorrt')
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith('config.update', {
      values: { 'managed.mode': 'docker-tensorrt' },
    })
  )
  expect(SERVER_SETTINGS_GROUPS.map((s) => s.id)).toEqual(
    expect.arrayContaining(['models', 'managed', 'log', 'update'])
  )
})

it('offers the actual control operation for a specialist service without generating a chat profile', async () => {
  const open = vi.fn()
  const workspace = {
    snapshot: { services: [{ id: 'embedding', kind: 'embedding', model: 'search-model', state: 'loaded' }] },
  } as unknown as Workspace
  render(<ServiceConnections workspace={workspace} openCommand={open} />)
  expect(screen.getByText(/atc control call media.embedding.run/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Embedding request' }))
  expect(open).toHaveBeenCalledWith('media.embedding.run')
  expect(screen.queryByRole('button', { name: 'Connect agent' })).not.toBeInTheDocument()
})

it('takes a client without a key directly to key creation', async () => {
  const keys = vi.fn()
  render(<ConnectionSteps model online hasKey={false} setup={vi.fn()} start={vi.fn()} openKeys={keys} />)
  await userEvent.click(screen.getByRole('button', { name: 'Create a client key' }))
  expect(keys).toHaveBeenCalledOnce()
})
