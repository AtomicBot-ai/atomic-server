import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { enginesList, workspaceFixture } from '@/test/workspace-fixture'
import { Catalog } from './Catalog'

it('downloads a selected GenieX GGUF on its chosen device without invoking the generic GGUF planner', async () => {
  const { workspace, execute } = workspaceFixture({
    'engines.list': enginesList(['llamacpp-upstream', 'geniex']),
    'models.catalog': [],
    'models.installed': [],
    'artifacts.list': [],
    'models.search': {
      models: [
        {
          model_id: 'qwen',
          name: 'Qwen for GenieX',
          default_variant: 'npu',
          variants: ['npu', 'gpu'].map((id) => ({ id, size_bytes: 1024, verdict: { verdict: 'ok' } })),
        },
      ],
    },
    'geniex.plan': { digest: 'verified', variant_id: 'qwen', blockers: [] },
  })
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
  await userEvent.click(
    await within(screen.getByText('Format', { selector: 'legend' }).parentElement!).findByRole('radio', {
      name: 'GenieX',
    })
  )
  await userEvent.keyboard('{Escape}')
  await userEvent.click(await screen.findByText('Qwen for GenieX', { selector: 'strong' }))
  await userEvent.selectOptions(screen.getByLabelText('Variant'), 'gpu')
  await userEvent.click(screen.getByRole('button', { name: 'Download', exact: true }))
  expect(execute).toHaveBeenCalledWith('geniex.plan', { model: 'qwen', variant: 'gpu' })
  expect(execute).toHaveBeenCalledWith('geniex.install', {
    plan_digest: 'verified',
    request_id: expect.any(String),
  })
  expect(execute).not.toHaveBeenCalledWith('models.plan', expect.anything())
})
