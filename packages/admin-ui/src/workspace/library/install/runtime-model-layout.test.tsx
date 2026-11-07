import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { GenieModelInstall } from './GenieModelInstall'
import { ManagedModelInstall } from './ManagedModelInstall'
import { catalogCards } from '../catalog/catalog-data'

it('shows one FLM variant without a selector, preserves unknown capabilities and exposes its known size', () => {
  const { workspace } = workspaceFixture({})
  const model = {
    model_id: 'qwen',
    name: 'Qwen',
    recommended: true,
    unverified: true,
    default_variant: 'qwen-npu2',
    variants: [
      {
        id: 'qwen-npu2',
        size_bytes: 2048,
        context_length: 32768,
        tools: true,
        reasoning: false,
        license: 'apache-2.0',
        verdict: { verdict: 'ok' },
      },
    ],
  }
  render(<GenieModelInstall engine="fastflowlm" workspace={workspace} model={model} onEngine={vi.fn()} />)
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  expect(screen.getByText('qwen-npu2')).toBeInTheDocument()
  expect(screen.getByText('Recommended')).toBeInTheDocument()
  expect(screen.getAllByText(/not verified by Atomic Chat/)).toHaveLength(1)
  expect(screen.getByText('Unknown')).toBeInTheDocument()
  expect(screen.getByText('Not supported')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Download', exact: true })).toBeEnabled()
  expect(catalogCards({ models: [model] }, 'fastflowlm')[0]).toMatchObject({
    size_bytes: 2048,
    context_length: 32768,
    summary: '',
  })
})

it('distinguishes blocked checks, rejected models and installable engines without exposing raw diagnostics by default', async () => {
  const install = vi.fn()
  const { workspace } = workspaceFixture({
    'models.check': {
      verdicts: [
        {
          engine: 'vllm',
          installed: false,
          compatibility: null,
          error: {
            code: 'MANAGED_PREREQUISITE_BLOCKED',
            message: 'No NVIDIA GPU was found on this machine.',
          },
        },
        {
          engine: 'sglang',
          installed: true,
          compatibility: {
            verdict: { ok: false, error: { code: 'UNSUPPORTED_MODEL', message: 'Unsupported architecture' } },
            fits_other_gpus: [],
            architectures: [],
            weight_bytes: 2048,
          },
        },
        {
          engine: 'tensorrt-llm',
          installed: false,
          compatibility: {
            verdict: { ok: true },
            fits_other_gpus: [],
            architectures: [],
            weight_bytes: 2048,
          },
        },
      ],
    },
  })
  render(
    <ManagedModelInstall
      embedded
      workspace={workspace}
      repository="acme/model"
      onClose={vi.fn()}
      onInstallEngine={install}
    />
  )
  const region = await screen.findByRole('region', { name: 'Engine compatibility' })
  expect(within(region).getByText('Setup required')).toBeVisible()
  expect(within(region).getByText('Not compatible')).toBeVisible()
  expect(within(region).getByText('Install required')).toBeVisible()
  const diagnostics = within(region).getByText(/MANAGED_PREREQUISITE_BLOCKED/)
  expect(diagnostics.closest('details')).not.toHaveAttribute('open')
  await userEvent.click(within(region).getAllByText('Details', { selector: 'summary' })[0]!)
  expect(diagnostics.closest('details')).toHaveAttribute('open')
  expect(screen.queryByRole('button', { name: 'Download', exact: true })).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Install TensorRT-LLM' }))
  expect(install).toHaveBeenCalledWith('tensorrt-llm')
})
