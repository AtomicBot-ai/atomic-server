import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { SETUP_GOALS, SERVER_SETTINGS_GROUPS } from '@contract'
import type { Workspace } from '../useWorkspace'
import { RuntimeSettings } from './settings/RuntimeSettings'
import { ServiceConnections } from './ServiceConnections'
import { ConnectionSteps } from './connection/ConnectionSteps'

it('ends every setup goal at server connections', () => {
  expect(SETUP_GOALS.map((goal) => goal.destination)).toEqual(SETUP_GOALS.map(() => 'server'))
})

it('keeps startup models and container settings editable in their own sections', async () => {
  const execute = vi.fn(async (name: string) =>
    name === 'config.get'
      ? {
          values: { models: { autoLoad: [] }, log: { level: 'info' } },
          fields: [
            { path: 'models.autoLoad', description: 'Models on start' },
            { path: 'log.level', values: ['debug', 'info'] },
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
  rerender(<RuntimeSettings workspace={workspace} section="log" />)
  await userEvent.selectOptions(await screen.findByLabelText('Log detail'), 'debug')
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith('config.update', {
      values: { 'log.level': 'debug' },
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
