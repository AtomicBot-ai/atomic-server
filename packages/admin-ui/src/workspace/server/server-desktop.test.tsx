import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture, enginesList } from '@/test/workspace-fixture'
import { Server } from './Server'
import { ServerConfiguration } from './ServerConfiguration'
import { ServerControlPanel } from './ServerControlPanel'
import { ServerModel } from './ServerModel'
import { Connections } from './Connections'

const services = [
  {
    id: 'chat',
    provider: 'llamacpp-upstream',
    model: 'chat-model',
    kind: 'chat',
    state: 'loaded',
    details: {},
  },
]
const keys = [{ id: 'key', name: 'Client', preview: 'atc_…1234', createdAt: 1 }]

it('follows overview search through one guide to prepared connection details and a real request', async () => {
  const { workspace, execute } = workspaceFixture(
    {
      'models.installed': [{ id: 'chat-model', providers: ['llamacpp-upstream'] }],
      'keys.list': keys,
      'connection.info': { endpoint: 'http://127.0.0.1:1337/v1' },
      'connection.profile': { launch_command: 'atc connect codex --model chat-model' },
    },
    { services, keys }
  )
  function Journey() {
    const [prepared, setPrepared] = useState<string[]>([])
    return (
      <Server
        workspace={workspace}
        openCommand={vi.fn()}
        openSetup={vi.fn()}
        prepared={prepared}
        onPrepared={(id) => setPrepared([id])}
      />
    )
  }
  render(<Journey />)
  await userEvent.type(screen.getByRole('textbox', { name: 'Search agents' }), 'Codex')
  expect(screen.getAllByRole('button', { name: 'Configure' })).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: 'Configure' }))
  expect(screen.getAllByRole('region', { name: 'Server setup' })).toHaveLength(1)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Configure & start' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Configure & start' }))
  expect(await screen.findByRole('button', { name: 'Copy launch command' })).toBeInTheDocument()
  expect(execute).toHaveBeenCalledWith('connection.profile', {
    agent: 'codex',
    model: 'chat-model',
    key_id: 'key',
  })
  await userEvent.click(screen.getByRole('button', { name: 'Done' }))
  await userEvent.click(screen.getByRole('button', { name: 'Connection prepared' }))
  expect(screen.queryByRole('region', { name: 'Server setup' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Agent')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Connection details' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Disconnect' })).not.toBeInTheDocument()
  execute.mockClear()
  await userEvent.click(screen.getByRole('button', { name: 'Send test request' }))
  expect(execute).toHaveBeenCalledWith('setup.complete', { model_id: 'chat-model' })
  expect(await screen.findByRole('status')).toHaveTextContent('Model responded successfully.')
})

it('keeps a failed request on its connection details and allows retry', async () => {
  let attempts = 0
  const { workspace, execute } = workspaceFixture(
    {
      'setup.complete': () => {
        if (attempts++ === 0) throw new Error('Model warming up')
        return {}
      },
    },
    { services, keys }
  )
  render(
    <Connections
      workspace={workspace}
      openCommand={vi.fn()}
      openSetup={vi.fn()}
      openKeys={vi.fn()}
      connectAgent={vi.fn()}
    />
  )
  await userEvent.click(screen.getByRole('button', { name: 'Send test request' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Model warming up')
  expect(screen.queryByText('Model responded successfully.')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Send test request' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Model responded successfully.')
  expect(execute.mock.calls.filter(([name]) => name === 'setup.complete')).toHaveLength(2)
})

it('opens the model catalog for an empty server and starts the API when a model is loaded', async () => {
  const open = vi.fn(),
    select = vi.fn(),
    dispatch = vi.spyOn(window, 'dispatchEvent')
  const { workspace, execute } = workspaceFixture({})
  workspace.snapshot!.api.running = false
  const { rerender } = render(
    <ServerControlPanel workspace={workspace} openSetup={open} selectSection={select} />
  )
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Start server' }))
  expect(screen.getByRole('status')).toHaveTextContent('Choose and download a model to continue.')
  expect(dispatch).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'atomic:acquire', detail: 'catalog' })
  )
  dispatch.mockRestore()
  expect(open).not.toHaveBeenCalled()
  expect(execute).not.toHaveBeenCalledWith('api.start')
  expect(execute).toHaveBeenCalledWith('engines.selected')
  workspace.snapshot!.services = services
  rerender(<ServerControlPanel workspace={workspace} openSetup={open} selectSection={select} />)
  await userEvent.click(screen.getByRole('button', { name: 'Start server' }))
  expect(execute).toHaveBeenCalledWith('api.start')
  await userEvent.click(screen.getByRole('button', { name: /Engine/ }))
  expect(select).toHaveBeenLastCalledWith('model')
  await userEvent.click(screen.getByRole('button', { name: /Connections/ }))
  expect(select).toHaveBeenLastCalledWith('connect')
})

it('discards configuration edits or saves the exact fields then restarts the running listener', async () => {
  const { workspace, execute } = workspaceFixture(
    {
      'config.get': {
        values: { api: { host: '127.0.0.1', port: 1337, prefix: '/v1', autoStart: false, trustedHosts: [] } },
      },
    },
    { keys }
  )
  render(<ServerConfiguration workspace={workspace} />)
  const host = await screen.findByLabelText('Host')
  expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  await userEvent.selectOptions(host, '0.0.0.0')
  await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
  expect(host).toHaveValue('127.0.0.1')
  expect(execute).not.toHaveBeenCalledWith('config.update', expect.anything())
  await userEvent.selectOptions(host, '0.0.0.0')
  await userEvent.click(screen.getByRole('switch'))
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(execute).toHaveBeenCalledWith('api.restart'))
  expect(execute).toHaveBeenCalledWith('config.update', {
    values: { 'api.host': '0.0.0.0', 'api.autoStart': true },
  })
  expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
})

it('chooses a compatible engine and model from dropdowns without unloading other services', async () => {
  const { workspace, execute } = workspaceFixture(
    {
      'engines.list': enginesList(['llamacpp-upstream', 'mlx']),
      'models.installed': [
        { id: 'chat-model', providers: ['llamacpp-upstream'] },
        { id: 'apple-model', providers: ['mlx'] },
      ],
    },
    { services }
  )
  render(<ServerModel workspace={workspace} openModels={vi.fn()} />)
  await userEvent.click(await screen.findByLabelText('Inference engine'))
  await userEvent.click(screen.getByRole('option', { name: /MLX/ }))
  const model = screen.getByLabelText('Model')
  expect(model).toHaveValue('apple-model')
  await userEvent.click(model)
  expect(screen.getAllByRole('option')).toHaveLength(1)
  expect(screen.getByRole('option')).toHaveTextContent('apple-model')
  await userEvent.keyboard('{Escape}')
  await userEvent.click(screen.getByRole('button', { name: 'Load model' }))
  expect(execute).toHaveBeenCalledWith('models.load', { provider: 'mlx', model_id: 'apple-model' })
  expect(execute).not.toHaveBeenCalledWith('models.unload', expect.anything())
})

it('explains invalid server port and prefix values, then clears warnings after correction', async () => {
  const { workspace, execute } = workspaceFixture({
    'config.get': { values: { api: { host: '127.0.0.1', port: 1337, prefix: '/v1', trustedHosts: [] } } },
  })
  render(<ServerConfiguration workspace={workspace} />)
  const port = await screen.findByLabelText('Port')
  await userEvent.clear(port)
  await userEvent.type(port, '1337')
  expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  for (const value of ['70000', '-1', '1.5']) {
    await userEvent.clear(port)
    await userEvent.type(port, value)
    expect(port).toHaveAttribute('aria-invalid', 'true')
    expect(port).toHaveAccessibleDescription(
      'Enter a whole number from 0 to 65535. Use 0 to choose a free port.'
    )
    expect(screen.getByRole('alert')).toHaveTextContent('0 to 65535')
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  }
  await userEvent.clear(port)
  expect(port).toHaveValue(null)
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  expect(execute).not.toHaveBeenCalledWith('config.update', expect.anything())
  await userEvent.type(port, '1777')
  expect(port).toHaveAttribute('aria-invalid', 'false')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  const prefix = screen.getByLabelText('API prefix')
  await userEvent.clear(prefix)
  await userEvent.type(prefix, 'v2')
  expect(prefix).toHaveAttribute('aria-invalid', 'true')
  expect(prefix).toHaveAccessibleDescription('Start the API prefix with /, for example /v1.')
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
  await userEvent.clear(prefix)
  await userEvent.type(prefix, '/v2')
  expect(prefix).toHaveAttribute('aria-invalid', 'false')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(execute).toHaveBeenCalledWith('config.update', { values: { 'api.port': 1777, 'api.prefix': '/v2' } })
})
it('accepts an explicit port zero for automatic port assignment', async () => {
  const { workspace, execute } = workspaceFixture({
    'config.get': { values: { api: { host: '127.0.0.1', port: 1337, prefix: '/v1', trustedHosts: [] } } },
  })
  render(<ServerConfiguration workspace={workspace} />)
  const port = await screen.findByLabelText('Port')
  await userEvent.clear(port)
  await userEvent.type(port, '0')
  expect(port).toHaveValue(0)
  expect(port).toHaveAttribute('aria-invalid', 'false')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(execute).toHaveBeenCalledWith('config.update', { values: { 'api.port': 0 } })
})

it('keeps the selected engine and model visible in the sidebar during their download', () => {
  const { workspace } = workspaceFixture(
    {},
    {
      setups: [
        {
          id: 'download',
          stage: 'downloading',
          plan: { model_id: 'Qwen-4B', provider: 'llamacpp-upstream' },
        },
      ],
    }
  )
  render(<ServerControlPanel workspace={workspace} openSetup={vi.fn()} selectSection={vi.fn()} />)
  expect(screen.getByRole('button', { name: /Engine/ })).toHaveTextContent('llama.cpp')
  expect(screen.getByRole('button', { name: /Model/ })).toHaveTextContent('Qwen-4B')
})
it('opens HTTPS proxy inside the Server context with the existing saved proxy settings', async () => {
  const { workspace } = workspaceFixture({
    'config.get': {
      values: { proxy: { url: 'http://localhost:8080' } },
      fields: [{ path: 'proxy.url', type: 'string' }],
    },
  })
  render(<Server workspace={workspace} section="proxy" openCommand={vi.fn()} openSetup={vi.fn()} />)
  expect(screen.getByRole('heading', { name: 'HTTPS proxy' })).toBeInTheDocument()
  expect(await screen.findByLabelText('Proxy address')).toHaveValue('http://localhost:8080')
})
