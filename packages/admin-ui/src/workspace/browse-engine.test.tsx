/** Server → Engine & model → Browse models opens the catalog filtered to the engine chosen there. */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { useState } from 'react'
import { enginesList, workspaceFixture } from '@/test/workspace-fixture'
import { ServerModel } from './server/ServerModel'
import { Catalog } from './library/catalog/Catalog'
import { CATALOG_PREFERENCES_KEY } from './library/catalog/catalog-preferences'

const ENGINES = enginesList(['llamacpp-upstream', 'foundry-local', 'litert-lm'])

it.each([
  ['foundry-local', 'Foundry Local'],
  ['fastflowlm', 'FastFlowLM'],
  ['mlx', 'MLX'],
])('browses the selected %s engine despite saved media and restrictive filters', async (engine, label) => {
  localStorage.setItem(
    CATALOG_PREFERENCES_KEY,
    JSON.stringify({
      category: 'image',
      format: 'gguf',
      query: 'old query',
      filters: { engine: 'llamacpp-upstream', downloaded: true, liked: true, uncensored: true },
    })
  )
  const { workspace, execute } = workspaceFixture({
    'engines.list': enginesList(['llamacpp-upstream', engine]),
    'models.installed': [],
    'artifacts.list': [],
    'models.search': { models: [] },
    'models.catalog': { rows: [] },
  })
  function Journey() {
    const [selected, setSelected] = useState<string>()
    return selected ? (
      <Catalog workspace={workspace} openCommand={vi.fn()} engine={selected} />
    ) : (
      <ServerModel workspace={workspace} openModels={setSelected} />
    )
  }
  render(<Journey />)
  await userEvent.click(await screen.findByLabelText('Inference engine'))
  await userEvent.click(screen.getByRole('option', { name: new RegExp(label) }))
  await userEvent.click(screen.getByRole('button', { name: 'Browse models' }))
  expect(await screen.findByLabelText('Model category')).toHaveValue('text')
  await waitFor(() =>
    engine === 'mlx'
      ? expect(execute).toHaveBeenCalledWith('models.catalog', { category: 'text' })
      : expect(execute).toHaveBeenCalledWith('models.search', { engine, query: '' })
  )
  await userEvent.click(screen.getByRole('button', { name: /^Filters/ }))
  for (const legend of ['Engine', 'Format']) {
    const group = within(screen.getByText(legend, { selector: 'legend' }).closest('fieldset')!)
    expect(group.getByRole('radio', { name: label })).toBeChecked()
  }
  const saved = JSON.parse(localStorage.getItem(CATALOG_PREFERENCES_KEY)!)
  expect(saved).toMatchObject({
    category: 'text',
    query: '',
    filters: {
      engine,
      downloaded: false,
      liked: false,
      uncensored: false,
    },
  })
})

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
