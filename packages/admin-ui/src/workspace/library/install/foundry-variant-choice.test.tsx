import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { FoundryModelInstall } from './FoundryModelInstall'

it.each([true, false])(
  'shows the runtime blocker and offers an update only when available (%s)',
  async (available) => {
    const reason = 'Foundry Local 2.1.0 is active; this model requires 2.4.0 or newer.'
    const { workspace, execute } = workspaceFixture({
      'foundry.plan': {
        blockers: [reason],
        verdict: { verdict: 'engine-update-required', reason, accelerator: null },
        update_available: available,
      },
    })
    const onFoundry = vi.fn()
    render(
      <FoundryModelInstall
        workspace={workspace}
        onClose={vi.fn()}
        onFoundry={onFoundry}
        model={{
          model_id: 'phi',
          name: 'Phi',
          unverified: false,
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
        }}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(await screen.findByText(reason)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument()
    const update = screen.queryByRole('button', { name: 'Update Foundry Local' })
    if (available) {
      expect(update).toBeVisible()
      await userEvent.click(update!)
      expect(onFoundry).toHaveBeenCalledOnce()
    } else expect(update).not.toBeInTheDocument()
    expect(execute).not.toHaveBeenCalledWith('foundry.install', expect.anything())
  }
)

it('shows compact variant choices with a separate reason and downloads the chosen CPU variant', async () => {
  const { workspace, execute } = workspaceFixture({
    'foundry.plan': { digest: 'cpu', variant_id: 'phi-cpu', blockers: [] },
    'foundry.install': {},
  })
  render(
    <FoundryModelInstall
      workspace={workspace}
      onClose={vi.fn()}
      onFoundry={vi.fn()}
      model={{
        model_id: 'phi',
        name: 'Phi',
        unverified: false,
        default_variant: 'phi-gpu',
        variants: [
          {
            id: 'phi-gpu',
            device: 'gpu',
            execution_provider: 'webgpu',
            size_bytes: 1024,
            verdict: {
              verdict: 'accelerator-not-prepared',
              reason: 'WebGPUExecutionProvider must be prepared.',
              accelerator: 'webgpu',
            },
          },
          {
            id: 'phi-cpu',
            device: 'cpu',
            execution_provider: 'cpu',
            size_bytes: 2048,
            verdict: { verdict: 'ok', reason: null, accelerator: null },
          },
          {
            id: 'phi-cuda',
            device: 'gpu',
            execution_provider: 'cuda',
            size_bytes: 1024,
            verdict: { verdict: 'accelerator-unavailable', reason: 'No NVIDIA GPU.', accelerator: null },
          },
        ],
      }}
    />
  )
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(screen.getByRole('radio', { name: /WebGPU/ })).toBeChecked()
  await userEvent.click(screen.getByRole('radio', { name: /CUDA/ }))
  expect(screen.getByText('No NVIDIA GPU.')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('radio', { name: /CPU/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Download' }))
  expect(execute).toHaveBeenCalledWith('foundry.plan', { model: 'phi', variant: 'phi-cpu' })
})

it('rechecks the selected variant after returning from engine preparation', async () => {
  const model = {
    model_id: 'phi',
    name: 'Phi',
    unverified: false,
    default_variant: 'gpu',
    variants: [
      {
        id: 'gpu',
        device: 'gpu',
        execution_provider: 'webgpu',
        size_bytes: 1024,
        verdict: { verdict: 'accelerator-not-prepared', reason: 'Prepare WebGPU', accelerator: 'webgpu' },
      },
    ],
  }
  const { workspace } = workspaceFixture({
    'models.search': {
      models: [
        {
          ...model,
          variants: [{ ...model.variants[0], verdict: { verdict: 'ok', reason: null, accelerator: null } }],
        },
      ],
    },
  })
  const props = { workspace, model, onClose: vi.fn(), onFoundry: vi.fn() }
  const ui = render(<FoundryModelInstall {...props} revision={0} />)
  expect(screen.getByRole('button', { name: /Prepare WebGPU/ })).toBeVisible()
  ui.rerender(<FoundryModelInstall {...props} revision={1} />)
  expect(await screen.findByRole('button', { name: 'Download' })).toBeVisible()
  expect(screen.getByRole('radio', { name: /WebGPU/ })).toBeChecked()
})
