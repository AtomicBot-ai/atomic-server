/** Server → Engine & model → Browse models opens the catalog filtered to the engine chosen there. */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { enginesList, workspaceFixture } from '@/test/workspace-fixture'
import { ServerModel } from './server/ServerModel'
import { Catalog } from './library/catalog/Catalog'

const ENGINES = enginesList(['llamacpp-upstream', 'foundry-local', 'litert-lm'])

it('hands the engine chosen on the server to Browse models', async () => {
  const { workspace } = workspaceFixture({ 'engines.list': ENGINES, 'models.installed': [] })
  const openModels = vi.fn()
  render(<ServerModel workspace={workspace} openModels={openModels} />)
  await userEvent.click(await screen.findByLabelText('Inference engine'))
  await userEvent.click(screen.getByRole('option', { name: /LiteRT-LM/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Browse models' }))
  expect(openModels).toHaveBeenCalledWith('litert-lm')
})

it('opens the catalog on that engine: its format, its engine filter and its own catalog', async () => {
  const { workspace, execute } = workspaceFixture({
    'engines.list': ENGINES,
    'models.installed': [],
    'artifacts.list': [],
    'models.search': { models: [] },
    'models.catalog': { rows: [] },
  })
  render(<Catalog workspace={workspace} openCommand={vi.fn()} engine="litert-lm" />)
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith('models.search', { engine: 'litert-lm', query: '' })
  )
  await userEvent.click(await screen.findByRole('button', { name: /^Filters/ }))
  const group = (legend: string) =>
    within(screen.getByText(legend, { selector: 'legend' }).closest('fieldset') as HTMLElement)
  expect(group('Engine').getByRole('radio', { name: 'LiteRT-LM' })).toBeChecked()
  expect(group('Format').getByRole('radio', { name: 'LiteRT-LM' })).toBeChecked()
})
