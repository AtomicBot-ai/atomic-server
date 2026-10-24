import { useState } from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import type { Workspace } from '../useWorkspace'
import type { RecordValue } from '../types'
import { CatalogBrowse } from './CatalogBrowse'
import { InstalledModels } from './InstalledModels'
import type { CatalogFormat } from './catalog-data'
import { catalogStatus } from './catalog-status'

const image = {
  id: 'download-job',
  stage: 'ready',
  plan: { model_id: 'flux:q4', name: 'Flux Q4', category: 'image', engine: 'sd-cpp' },
}
beforeEach(() => localStorage.clear())
function Browse({
  workspace,
  catalog = [],
  category = 'text',
}: {
  workspace: Workspace
  catalog?: RecordValue[]
  category?: string
}) {
  const [format, setFormat] = useState<CatalogFormat>('gguf')
  return (
    <CatalogBrowse
      catalog={catalog}
      category={category}
      setCategory={vi.fn()}
      format={format}
      setFormat={setFormat}
      query=""
      setQuery={vi.fn()}
      engines={[{ engine: 'llamacpp-upstream' }, { engine: 'mlx' }]}
      loading={false}
      execute={workspace.execute}
      search={vi.fn()}
      choose={vi.fn()}
      importFile={vi.fn()}
      workspace={workspace}
    />
  )
}

it('shows a raw image artifact only in its category, matches its variant to the family, and unloads the running model', async () => {
  const { workspace, execute } = workspaceFixture(
    { 'models.installed': [], 'artifacts.list': [image] },
    {
      services: [
        {
          id: 'image-video',
          kind: 'image-video',
          provider: 'sd-cpp',
          model: 'flux:q4',
          state: 'ready',
          details: {},
        },
      ],
    }
  )
  const view = render(<Browse workspace={workspace} />)
  await waitFor(() => expect(execute).toHaveBeenCalledWith('artifacts.list'))
  expect(screen.queryByText('Flux Q4')).not.toBeInTheDocument()
  view.rerender(<Browse workspace={workspace} category="image" catalog={[{ id: 'flux', name: 'Flux' }]} />)
  await screen.findByRole('heading', { name: 'Installed', exact: true })
  expect(screen.getByText('Loaded')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Available', exact: true })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Flux', exact: true }))
  expect(screen.getByRole('button', { name: 'Ready' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Download', exact: true })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Unload' }))
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Unload model' }))
  expect(execute).toHaveBeenCalledWith('media.unload')
  await userEvent.click(screen.getByRole('button', { name: '× Delete' }))
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete model' }))
  expect(execute).toHaveBeenCalledWith('downloads.remove', {
    id: 'download-job',
    owner: 'artifacts',
    installed: true,
  })
})

it('keeps imported GGUF and MLX models discoverable under their actual format and engine', async () => {
  const { workspace } = workspaceFixture({
    'models.installed': [
      { id: 'local-gguf', name: 'Imported GGUF', providers: ['llamacpp-upstream'] },
      { id: 'local-mlx', name: 'Imported MLX', provider: 'mlx' },
    ],
    'artifacts.list': [],
  })
  render(<Browse workspace={workspace} />)
  await screen.findByRole('button', { name: 'Imported GGUF', exact: true })
  expect(screen.queryByRole('button', { name: 'Imported MLX', exact: true })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
  const engines = within(screen.getByText('Engine', { selector: 'legend' }).parentElement!)
  await userEvent.click(engines.getByRole('radio', { name: /MLX/ }))
  expect(screen.getByRole('button', { name: 'Imported MLX', exact: true })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Imported GGUF', exact: true })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('radio', { name: 'GGUF', exact: true }))
  expect(screen.getByRole('button', { name: 'Imported GGUF', exact: true })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Imported GGUF', exact: true }))
  expect(screen.getByRole('button', { name: 'Load model' })).toBeInTheDocument()
})

it.each(['null', '{}'])('renders model likes safely when storage contains %s', async (value) => {
  localStorage.setItem('atomic-server-model-likes', value)
  const { workspace } = workspaceFixture({ 'models.installed': [], 'artifacts.list': [] })
  render(<Browse workspace={workspace} catalog={[{ id: 'test', name: 'Test' }]} />)
  await userEvent.click(screen.getByRole('button', { name: 'Like Test' }))
  expect(screen.getByRole('button', { name: 'Like Test' })).toHaveAttribute('aria-pressed', 'true')
  expect(JSON.parse(localStorage.getItem('atomic-server-model-likes')!)).toEqual(['test'])
})

it('loads an image by job ID and retries a failed load without offering chat-only controls', async () => {
  let reject!: (error: Error) => void
  const loading = new Promise((_, fail) => {
    reject = fail
  })
  let attempts = 0
  const { workspace, execute } = workspaceFixture({
    'artifacts.load': () => (++attempts === 1 ? loading : {}),
  })
  render(
    <InstalledModels
      compact
      workspace={workspace}
      installed={[image]}
      loading={false}
      openCommand={vi.fn()}
      browse={vi.fn()}
    />
  )
  await userEvent.click(screen.getByRole('button', { name: 'Load model' }))
  expect(execute).toHaveBeenCalledWith('artifacts.load', { id: 'download-job' })
  expect(screen.queryByRole('button', { name: 'Cancel loading' })).not.toBeInTheDocument()
  await act(async () => reject(new Error('Engine could not load this model')))
  expect(await screen.findByRole('alert')).toHaveTextContent('Engine could not load this model')
  expect(screen.queryByRole('button', { name: 'View log' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Load model' }))
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect(execute.mock.calls.filter(([name]) => name === 'artifacts.load')).toHaveLength(2)
  expect(execute).not.toHaveBeenCalledWith('models.load', expect.anything())
})

it('recognizes a loaded MLX artifact using its model ID and engine from the plan', async () => {
  const { workspace, execute } = workspaceFixture(
    {},
    {
      services: [
        { id: 'mlx', kind: 'chat', provider: 'mlx', model: 'local/mlx', state: 'ready', details: {} },
      ],
    }
  )
  render(
    <InstalledModels
      compact
      workspace={workspace}
      installed={[
        {
          id: 'mlx-job',
          stage: 'ready',
          plan: { model_id: 'local/mlx', engine: 'mlx', category: 'text', name: 'MLX' },
        },
      ]}
      loading={false}
      openCommand={vi.fn()}
      browse={vi.fn()}
    />
  )
  expect(screen.getByRole('button', { name: 'Ready' })).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: 'Unload' }))
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Unload model' }))
  expect(execute).toHaveBeenCalledWith('models.unload', { provider: 'mlx', model_id: 'local/mlx' })
})

it('updates catalog badges from qualified local sessions and exposes the status in narrow rows', async () => {
  const file = { id: 'owner/family/model.Q4.gguf', providers: ['llamacpp-upstream'] }
  const { workspace } = workspaceFixture({ 'models.installed': [file], 'artifacts.list': [] })
  const catalog = [{ id: 'owner/family', name: 'Family' }]
  const view = render(<Browse workspace={workspace} catalog={catalog} />)
  await screen.findAllByText('Downloaded')
  const snapshot = workspace.snapshot!
  const loaded = {
    ...workspace,
    snapshot: {
      ...snapshot,
      services: [
        {
          id: 'local',
          provider: 'llamacpp-upstream',
          kind: 'chat' as const,
          model: file.id,
          state: 'ready',
          details: {},
        },
      ],
    },
  }
  view.rerender(<Browse workspace={loaded} catalog={catalog} />)
  expect(screen.getByText('Loaded', { selector: '.hub-device-compact' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Family', exact: true })).toBeInTheDocument()
  expect(catalogStatus(loaded.snapshot, catalog[0]!, [file], 'text', 'mlx')).toBe('Downloaded')
  const loading = {
    ...workspace,
    snapshot: {
      ...snapshot,
      services: [],
      loads: [
        {
          model_id: file.id,
          provider: 'llamacpp-upstream' as const,
          stage: 'initializing-engine' as const,
          generation: 'g',
          at: 0,
          elapsed_ms: 0,
        },
      ],
    },
  }
  view.rerender(<Browse workspace={loading} catalog={catalog} />)
  expect(screen.getByText('Loading…', { selector: '.hub-device-compact' })).toBeInTheDocument()
  const cloud = {
    ...loaded,
    snapshot: {
      ...loaded.snapshot,
      services: loaded.snapshot.services.map((service) => ({ ...service, details: { cloud: true } })),
    },
  }
  view.rerender(<Browse workspace={cloud} catalog={catalog} />)
  expect(screen.queryByText('Loaded')).not.toBeInTheDocument()
  expect(screen.getByText('Downloaded', { selector: '.hub-device-compact' })).toBeInTheDocument()
  expect(
    catalogStatus(
      {
        ...snapshot,
        services: loaded.snapshot.services,
        setups: [
          {
            request: { repo: 'other/repo' },
            plan: { model_id: file.id },
          },
        ],
      },
      { id: 'other/repo' },
      [file],
      'text'
    )
  ).toBe('Loaded')
  await act(async () => {})
})
