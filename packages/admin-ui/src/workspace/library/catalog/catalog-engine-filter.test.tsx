import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { enginesList, workspaceFixture } from '@/test/workspace-fixture'
import { Catalog } from './Catalog'

async function chooseEngine(name: string) {
  await userEvent.click(screen.getByRole('button', { name: /^Filters/ }))
  const group = within(screen.getByText('Engine', { selector: 'legend' }).parentElement!)
  await userEvent.click(await group.findByRole('radio', { name, exact: true }))
  await userEvent.keyboard('{Escape}')
}

it.each([
  ['vLLM', 'vllm'],
  ['SGLang', 'sglang'],
])('keeps %s results visible and searches its selected engine catalog', async (label, engine) => {
  const { workspace, execute } = workspaceFixture({
    'engines.list': enginesList(['llamacpp-upstream', 'vllm', 'sglang']),
    'models.catalog': (input: Record<string, unknown>) =>
      input.engine ? { models: [{ repository: `${input.engine}/catalog-model` }] } : [],
    'models.search': (input: Record<string, unknown>) => ({
      models: [{ repository: `${input.engine}/${input.query}` }],
    }),
    'models.installed': [],
    'artifacts.list': [],
  })
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await chooseEngine(label)
  expect(await screen.findByText(`${engine}/catalog-model`, { selector: 'strong' })).toBeInTheDocument()
  expect(execute).toHaveBeenCalledWith('models.catalog', { engine })
  expect(screen.queryByText('No models match these filters.')).not.toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Search for models'), 'searched-model')
  expect(await screen.findByText(`${engine}/searched-model`, { selector: 'strong' })).toBeInTheDocument()
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith('models.search', { engine, query: 'searched-model' })
  )
})

it('retains Foundry provider identity when filtering by engine and expanding variants', async () => {
  const { workspace, execute } = workspaceFixture({
    'engines.list': enginesList(['llamacpp-upstream', 'foundry-local']),
    'models.catalog': [],
    'models.search': {
      models: [
        {
          model_id: 'phi',
          name: 'Phi 4 Mini',
          default_variant: 'phi-cpu',
          variants: [
            {
              id: 'phi-cpu',
              device: 'cpu',
              execution_provider: 'cpu',
              size_bytes: 1000,
              verdict: { verdict: 'ok', reason: null, accelerator: null },
            },
          ],
        },
      ],
    },
    'models.installed': [],
    'artifacts.list': [],
  })
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await chooseEngine('Foundry Local')
  await userEvent.click(await screen.findByText('Phi 4 Mini', { selector: 'strong' }))
  expect(await screen.findByLabelText('Variant')).toHaveValue('phi-cpu')
  expect(screen.getByRole('button', { name: 'Download', exact: true })).toBeEnabled()
  expect(execute).toHaveBeenCalledWith('models.search', { engine: 'foundry-local', query: '' })
})
