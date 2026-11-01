import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { CatalogBrowse } from './CatalogBrowse'

it('shows a downloaded audio model with its notice, and unloads it through the audio operations', async () => {
  const stable = {
    id: 'job',
    stage: 'ready',
    category: 'audio',
    plan: {
      category: 'audio',
      engine: 'audio-cpp',
      model_id: 'stable:q8_0',
      name: 'Stable Audio',
      audio: { attribution: 'Powered by Stability AI' },
    },
  }
  const { workspace, execute } = workspaceFixture(
    { 'models.installed': [], 'artifacts.list': [stable] },
    {
      services: [
        {
          id: 'audio',
          kind: 'audio',
          provider: 'audio-cpp',
          model: 'stable:q8_0',
          state: 'loaded',
          details: {},
        },
      ],
    }
  )
  render(
    <CatalogBrowse
      catalog={[{ id: 'stable', name: 'Stable Audio' }]}
      category="audio"
      setCategory={vi.fn()}
      format="gguf"
      setFormat={vi.fn()}
      query=""
      setQuery={vi.fn()}
      engines={[]}
      loading={false}
      execute={workspace.execute}
      search={vi.fn()}
      choose={vi.fn()}
      importFile={vi.fn()}
      workspace={workspace}
    />
  )
  await screen.findByRole('heading', { name: 'Installed', exact: true })
  expect(screen.getByText('Loaded')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Stable Audio', exact: true }))
  expect(screen.getByText('Powered by Stability AI')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Unload' }))
  await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Unload model' }))
  expect(execute).toHaveBeenCalledWith('audio.unload')
})
