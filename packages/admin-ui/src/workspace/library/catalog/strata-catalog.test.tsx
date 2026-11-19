import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { enginesList, workspaceFixture } from '@/test/workspace-fixture'
import { Catalog } from './Catalog'

it('offers Strata variants from the server and starts their combined installation', async () => {
  const defaultQuant = 'iq3-xxs-dflash2'
  const id = 'iq3-s-dflash2'
  const { workspace, execute } = workspaceFixture({
    'engines.list': enginesList(['llamacpp-upstream', 'strata']),
    'models.catalog': [],
    'models.installed': [],
    'artifacts.list': [],
    'models.search': {
      models: [
        {
          model_id: defaultQuant,
          name: 'Qwen for Strata',
          default_variant: defaultQuant,
          variants: [
            { id: defaultQuant, label: 'IQ3_XXS', size_bytes: 1024, verdict: { verdict: 'ok' } },
            { id, label: 'IQ3_S', size_bytes: 2048, verdict: { verdict: 'ok' } },
          ],
        },
      ],
    },
    'strata.plan': { digest: 'verified', variant_id: id, blockers: [] },
  })
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
  await userEvent.click(
    await within(screen.getByText('Format', { selector: 'legend' }).parentElement!).findByRole('radio', {
      name: 'Strata',
    })
  )
  await userEvent.keyboard('{Escape}')
  await userEvent.click(await screen.findByText('Qwen for Strata', { selector: 'strong' }))
  const quantization = screen.getByRole('button', { name: 'Quantization IQ3_XXS' })
  await userEvent.click(quantization)
  expect(screen.getByRole('dialog', { name: 'Choose quantization' })).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  expect(quantization).toHaveFocus()
  await userEvent.keyboard('{Enter}{ArrowDown}{Enter}')
  expect(screen.getByRole('button', { name: 'Quantization IQ3_S' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Download', exact: true }))
  expect(execute).toHaveBeenCalledWith('strata.plan', { model: id })
  expect(execute).toHaveBeenCalledWith('strata.install', {
    plan_digest: 'verified',
    request_id: expect.any(String),
  })
})
