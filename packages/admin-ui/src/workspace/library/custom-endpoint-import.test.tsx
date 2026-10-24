import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { CloudProviders } from './CloudProviders'
import { ImportModel } from './ImportModel'
import { Catalog } from './Catalog'

it('keeps custom endpoints usable after cancel, successful checking, edit and adding another', async () => {
  const providers: unknown[] = []
  const { workspace, execute } = workspaceFixture({
    'cloud.list': () => ({ providers }),
    'cloud.connect': (input: Record<string, unknown>) => {
      const saved = { ...input, connected: true, has_api_key: true }
      providers.push(saved)
      return saved
    },
  })
  render(<CloudProviders workspace={workspace} custom />)
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
  await userEvent.click(screen.getByRole('button', { name: 'Add endpoint' }))
  await userEvent.type(await screen.findByLabelText('Provider name'), 'my-provider')
  await userEvent.type(screen.getByLabelText(/Base URL/), 'https://provider.example/v1')
  await userEvent.type(screen.getByLabelText('API key'), 'secret-only-test')
  await userEvent.type(screen.getByLabelText(/Model IDs/), 'model-one')
  await userEvent.click(screen.getByRole('button', { name: 'Connect', exact: true }))
  expect(await screen.findByText('✓ Connected')).toBeInTheDocument()
  expect(screen.getByText('https://provider.example/v1')).toBeInTheDocument()
  expect(screen.queryByDisplayValue('secret-only-test')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Edit connection' }))
  expect(screen.getByLabelText('Provider name')).toHaveValue('my-provider')
  expect(screen.getByLabelText(/Base URL/)).toHaveValue('https://provider.example/v1')
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
  await userEvent.click(screen.getByRole('button', { name: 'Add another one' }))
  expect(screen.getByLabelText('Provider name')).toHaveValue('')
  expect(execute.mock.calls.filter(([name]) => name === 'cloud.connect')).toHaveLength(1)
})
it('keeps a failed custom endpoint editable and allows retry', async () => {
  let fail = true
  const { workspace } = workspaceFixture({
    'cloud.connect': () => {
      if (fail) throw new Error('Provider refused the key')
      return { provider: 'custom', base_url: 'http://localhost:8080/v1', connected: true }
    },
  })
  render(<CloudProviders workspace={workspace} custom />)
  await userEvent.type(await screen.findByLabelText('Provider name'), 'custom')
  await userEvent.type(screen.getByLabelText(/Base URL/), 'http://localhost:8080/v1')
  await userEvent.click(screen.getByRole('button', { name: 'Connect', exact: true }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Provider refused the key')
  expect(screen.getByLabelText('Provider name')).toHaveValue('custom')
  fail = false
  await userEvent.click(screen.getByRole('button', { name: 'Connect', exact: true }))
  expect(await screen.findByRole('button', { name: 'Add endpoint' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('validates an import path and preserves it across an error and retry', async () => {
  let fail = true
  const done = vi.fn()
  const { workspace, execute } = workspaceFixture({
    'models.import': () => {
      if (fail) throw new Error('File not found')
      return { id: 'imported' }
    },
  })
  render(<ImportModel workspace={workspace} onClose={vi.fn()} onImported={done} />)
  const input = screen.getByLabelText('Model file path')
  await userEvent.type(input, 'relative.gguf')
  expect(screen.getByRole('button', { name: 'Import model' })).toBeDisabled()
  await userEvent.clear(input)
  await userEvent.type(input, '/models/local.gguf')
  await userEvent.click(screen.getByRole('button', { name: 'Import model' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('File not found')
  expect(input).toHaveValue('/models/local.gguf')
  expect(done).not.toHaveBeenCalled()
  fail = false
  await userEvent.click(screen.getByRole('button', { name: 'Import model' }))
  await waitFor(() => expect(done).toHaveBeenCalledOnce())
  expect(execute).toHaveBeenLastCalledWith('models.import', { path: '/models/local.gguf' })
})
it('keeps an import active while the server registers the file', async () => {
  let finish!: () => void
  const close = vi.fn(),
    done = vi.fn()
  const { workspace } = workspaceFixture({
    'models.import': () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  })
  render(<ImportModel workspace={workspace} onClose={close} onImported={done} />)
  await userEvent.type(screen.getByLabelText('Model file path'), 'C:\\Models\\local.gguf')
  await userEvent.click(screen.getByRole('button', { name: 'Import model' }))
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  await userEvent.keyboard('{Escape}')
  expect(close).not.toHaveBeenCalled()
  await act(async () => finish())
  expect(done).toHaveBeenCalledOnce()
})
it('opens the dedicated import dialog from the catalog', async () => {
  const { workspace } = workspaceFixture({ 'models.catalog': [], 'engines.list': { engines: [] } })
  const command = vi.fn()
  render(<Catalog workspace={workspace} openCommand={command} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Import', exact: true }))
  expect(screen.getByRole('dialog', { name: 'Import local model' })).toBeInTheDocument()
  expect(command).not.toHaveBeenCalled()
})
it('reveals an imported GGUF in Text after importing from Images with a search', async () => {
  let imported = false
  const { workspace, execute } = workspaceFixture({
    'models.catalog': [],
    'engines.list': { engines: [] },
    'artifacts.list': [],
    'models.installed': () =>
      imported ? [{ id: 'local-model', name: 'My imported model', providers: ['llamacpp-upstream'] }] : [],
    'models.import': () => {
      imported = true
      return { id: 'local-model' }
    },
  })
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await userEvent.click(screen.getByRole('combobox', { name: 'Model category' }))
  await userEvent.click(screen.getByRole('option', { name: /Images/ }))
  await userEvent.type(screen.getByLabelText('Search for models'), 'image search')
  await userEvent.click(screen.getByRole('button', { name: 'Import', exact: true }))
  await userEvent.type(screen.getByLabelText('Model file path'), '/models/local-model.gguf')
  await userEvent.click(screen.getByRole('button', { name: 'Import model' }))
  await screen.findByRole('button', { name: 'My imported model', exact: true })
  expect(screen.getByLabelText('Model category')).toHaveValue('text')
  expect(screen.getByLabelText('Search for models')).toHaveValue('')
  expect(execute).toHaveBeenCalledWith('models.catalog', { category: 'text' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('opens existing custom endpoints as a list without automatically showing an editor', async () => {
  const { workspace } = workspaceFixture({
    'cloud.list': {
      providers: [
        { provider: 'office', base_url: 'https://office.example/v1', connected: true },
        { provider: 'lab', base_url: 'https://lab.example/v1', connected: true },
      ],
    },
  })
  render(<CloudProviders workspace={workspace} custom />)
  expect(await screen.findByText('office')).toBeInTheDocument()
  expect(screen.getByText('lab')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Add another one' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
})
