import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { enginesList, workspaceFixture } from '@/test/workspace-fixture'
import { Catalog } from './Catalog'

it('downloads a selected FastFlowLM model on its chosen device without invoking the generic model planner', async () => {
  const { workspace, execute } = workspaceFixture({
    'engines.list': enginesList(['llamacpp-upstream', 'fastflowlm']),
    'models.catalog': [],
    'models.installed': [],
    'artifacts.list': [],
    'models.search': {
      models: [
        {
          model_id: 'qwen',
          name: 'Qwen for FastFlowLM',
          recommended: true,
          default_variant: 'npu',
          variants: ['npu', 'npu2'].map((id) => ({
            id,
            size_bytes: 1024,
            verdict: { verdict: 'ok' },
            license: id + '-license',
            context_length: id === 'npu' ? 2048 : 4096,
          })),
        },
      ],
    },
    'fastflowlm.plan': { digest: 'verified', variant_id: 'qwen', blockers: [] },
  })
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
  await userEvent.click(
    await within(screen.getByText('Format', { selector: 'legend' }).parentElement!).findByRole('radio', {
      name: 'FastFlowLM',
    })
  )
  await userEvent.keyboard('{Escape}')
  await userEvent.click(await screen.findByText('Qwen for FastFlowLM', { selector: 'strong' }))
  expect(await screen.findByText('Recommended')).toBeTruthy()
  await userEvent.selectOptions(screen.getByLabelText('Variant'), 'npu2')
  expect(screen.getByText('npu2-license')).toBeTruthy()
  expect(screen.getByText('4,096 tokens')).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Download', exact: true }))
  expect(execute).toHaveBeenCalledWith('fastflowlm.plan', { model: 'qwen', variant: 'npu2' })
  expect(execute).toHaveBeenCalledWith('fastflowlm.install', {
    plan_digest: 'verified',
    request_id: expect.any(String),
  })
  expect(execute).not.toHaveBeenCalledWith('models.plan', expect.anything())
})
it('recognizes the installed native variant in its family and keeps other providers separate', async () => {
  const { installedCatalogMatches } = await import('./catalog-models')
  const { catalogStatus } = await import('./catalog-status')
  const row = { id: 'qwen', format: 'FastFlowLM', fastflowlm: { variants: [{ id: 'qwen-npu2' }] } }
  const model = { id: 'qwen-npu2', provider: 'fastflowlm' }
  expect(installedCatalogMatches(model, row)).toBe(true)
  expect(catalogStatus(null, row, [model], 'text')).toBe('Downloaded')
  expect(installedCatalogMatches({ ...model, provider: 'llamacpp-upstream' }, row)).toBe(false)
})
