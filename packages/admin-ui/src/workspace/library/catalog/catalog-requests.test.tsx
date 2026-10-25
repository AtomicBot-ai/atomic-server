import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { enginesList, workspaceFixture } from '@/test/workspace-fixture'
import { Catalog } from './Catalog'

function deferred() {
  let resolve!: (value: unknown) => void, reject!: (reason: Error) => void
  const promise = new Promise((ok, fail) => {
    resolve = ok
    reject = fail
  })
  return { promise, resolve, reject }
}
const model = (id: string, format = 'gguf') => ({ id, name: id, source: { format } })
const answers = {
  'engines.list': enginesList(['llamacpp-upstream', 'mlx']),
  'models.installed': [],
  'artifacts.list': [],
}

it('keeps a newer search result when an earlier catalog refresh finishes later', async () => {
  const initial = deferred()
  const { workspace, execute } = workspaceFixture({
    ...answers,
    'models.catalog': () => initial.promise,
    'models.search': { rows: [model('new result')] },
  })
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await waitFor(() => expect(execute).toHaveBeenCalledWith('models.catalog', { category: 'text' }))
  await userEvent.type(screen.getByLabelText('Search for models'), 'new{Enter}')
  await screen.findByText('new result', { selector: 'strong' })
  await act(async () => initial.resolve({ rows: [model('old result')] }))
  expect(screen.getByText('new result', { selector: 'strong' })).toBeInTheDocument()
  expect(screen.queryByText('old result', { selector: 'strong' })).not.toBeInTheDocument()
  expect(screen.queryByText('Loading models…')).not.toBeInTheDocument()
})

it('ignores a failed text search while the newly selected image catalog is still loading', async () => {
  const search = deferred(),
    images = deferred()
  const { workspace, execute } = workspaceFixture({
    ...answers,
    'models.catalog': (input: Record<string, unknown>) =>
      input.category === 'image' ? images.promise : { rows: [] },
    'models.search': () => search.promise,
  })
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await userEvent.type(screen.getByLabelText('Search for models'), 'old{Enter}')
  await userEvent.click(screen.getByRole('combobox', { name: 'Model category' }))
  await userEvent.click(screen.getByRole('option', { name: /Images/ }))
  await waitFor(() => expect(execute).toHaveBeenCalledWith('models.catalog', { category: 'image' }))
  await act(async () => search.reject(new Error('Old search failed')))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByText('Loading models…')).toBeInTheDocument()
  await act(async () => images.resolve({ rows: [{ id: 'flux', name: 'Flux', category: 'image' }] }))
  expect(screen.getByText('Flux', { selector: 'strong' })).toBeInTheDocument()
  expect(screen.getByLabelText('Model category')).toHaveValue('image')
})

it('ignores prior format responses after a newer format is chosen', async () => {
  const gguf = deferred(),
    mlx = deferred()
  let calls = 0
  const { workspace, execute } = workspaceFixture({
    ...answers,
    'models.catalog': () => (++calls === 1 ? gguf.promise : mlx.promise),
  })
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await waitFor(() => expect(execute).toHaveBeenCalledWith('engines.list'))
  await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
  const format = within(screen.getByText('Format', { selector: 'legend' }).parentElement!)
  await userEvent.click(await format.findByRole('radio', { name: 'MLX', exact: true }))
  await userEvent.keyboard('{Escape}')
  await act(async () => mlx.resolve({ rows: [model('MLX model', 'mlx')] }))
  await screen.findByText('MLX model', { selector: 'strong' })
  await act(async () => gguf.resolve({ rows: [model('old GGUF')] }))
  expect(screen.getByText('MLX model', { selector: 'strong' })).toBeInTheDocument()
  expect(screen.queryByText('old GGUF', { selector: 'strong' })).not.toBeInTheDocument()
})

it('invalidates pending work when the parent changes the active tab', async () => {
  const search = deferred()
  const { workspace } = workspaceFixture({
    ...answers,
    'models.catalog': [],
    'models.search': () => search.promise,
  })
  const view = render(<Catalog section="catalog" workspace={workspace} openCommand={vi.fn()} />)
  await userEvent.type(screen.getByLabelText('Search for models'), 'old{Enter}')
  view.rerender(<Catalog section="downloads" workspace={workspace} openCommand={vi.fn()} />)
  await act(async () => search.reject(new Error('Old tab failed')))
  expect(screen.getByRole('heading', { name: 'Downloads', exact: true })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  view.rerender(<Catalog section="catalog" workspace={workspace} openCommand={vi.fn()} />)
  await screen.findByText('No models match these filters.')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('restores the catalog when search is cleared and ignores the abandoned search response', async () => {
  const search = deferred()
  const { workspace, execute } = workspaceFixture({
    ...answers,
    'models.catalog': { rows: [model('Catalog model')] },
    'models.search': () => search.promise,
  })
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await screen.findByText('Catalog model', { selector: 'strong' })
  await userEvent.type(screen.getByLabelText('Search for models'), 'remote{Enter}')
  await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  await screen.findByText('Catalog model', { selector: 'strong' })
  await act(async () => search.resolve({ rows: [model('remote result')] }))
  expect(screen.queryByText('remote result', { selector: 'strong' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('Search for models')).toHaveValue('')
  expect(execute.mock.calls.filter(([name]) => name === 'models.catalog')).toHaveLength(2)
})
it('searches after typing without requiring Enter and returns focus to search after clearing', async () => {
  const { workspace, execute } = workspaceFixture({
    ...answers,
    'models.catalog': { rows: [model('Qwen local')] },
    'models.search': { rows: [model('Qwen remote')] },
  })
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await screen.findByText('Qwen local', { selector: 'strong' })
  await userEvent.type(screen.getByLabelText('Search for models'), 'Qwen')
  await waitFor(() => expect(execute).toHaveBeenCalledWith('models.search', { query: 'Qwen' }))
  expect(await screen.findByText('Qwen remote', { selector: 'strong' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  expect(screen.getByLabelText('Search for models')).toHaveFocus()
  expect(await screen.findByText('Qwen local', { selector: 'strong' })).toBeInTheDocument()
})
it('retains the current search after starting a model download', async () => {
  const { workspace, execute } = workspaceFixture({
    ...answers,
    'models.catalog': { rows: [model('Catalog model')] },
    'models.search': { rows: [model('Remote model')] },
    'models.files': [{ filename: 'model.gguf', size: 500 }],
    'models.plan': {
      digest: 'digest',
      provider: 'llamacpp-upstream',
      blockers: [],
      total_download_bytes: 500,
    },
    'models.install': { id: 'job' },
  })
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await screen.findByText('Catalog model', { selector: 'strong' })
  await userEvent.type(screen.getByLabelText('Search for models'), 'Remote{Enter}')
  await userEvent.click(await screen.findByRole('button', { name: 'Remote model', exact: true }))
  await userEvent.click(await screen.findByRole('button', { name: 'Download', exact: true }))
  await waitFor(() => expect(execute.mock.calls.filter(([name]) => name === 'models.search')).toHaveLength(2))
  expect(await screen.findByRole('button', { name: 'Remote model', exact: true })).toBeInTheDocument()
  expect(screen.getByLabelText('Search for models')).toHaveValue('Remote')
})
