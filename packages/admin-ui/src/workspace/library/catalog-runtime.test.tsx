import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { enginesList, workspaceFixture } from '@/test/workspace-fixture'
import { Catalog } from './Catalog'
import { FoundryModelInstall } from './FoundryModelInstall'

const repository = 'acme/managed-model'
const verdict = (engine: string) => ({
  engine,
  installed: true,
  compatibility: { verdict: { ok: true }, fits_other_gpus: [], weight_bytes: 1000, architectures: [] },
})
async function format(name: string) {
  await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
  const formats = within(screen.getByText('Format', { selector: 'legend' }).parentElement!)
  await userEvent.click(await formats.findByRole('radio', { name, exact: true }))
  await userEvent.keyboard('{Escape}')
}

it('checks blockers inline, locks engine choice during download, and retries the same request without a confirmation', async () => {
  let reject!: (error: Error) => void
  const failed = new Promise((_, fail) => {
    reject = fail
  })
  let attempts = 0
  const { workspace, execute } = workspaceFixture({
    'engines.list': enginesList(['llamacpp-upstream', 'vllm', 'sglang']),
    'models.catalog': (input: Record<string, unknown>) => (input.engine ? { models: [{ repository }] } : []),
    'models.installed': [],
    'artifacts.list': [],
    'models.check': { verdicts: [verdict('vllm'), verdict('sglang')] },
    'managed.plan': (input: Record<string, unknown>) => ({
      digest: input.engine,
      download_bytes: 1000,
      blockers: input.engine === 'vllm' ? ['Not enough space'] : [],
    }),
    'managed.install': () => (++attempts === 1 ? failed : {}),
  })
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await format('Safetensors')
  await userEvent.click(await screen.findByText(repository, { selector: 'strong' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Download', exact: true }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Not enough space')
  expect(execute).not.toHaveBeenCalledWith('managed.install', expect.anything())
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await userEvent.selectOptions(screen.getByLabelText('Engine'), 'sglang')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Download', exact: true }))
  expect(screen.getByLabelText('Engine')).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Review download' })).not.toBeInTheDocument()
  await act(async () => reject(new Error('Connection lost')))
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost')
  await userEvent.click(screen.getByRole('button', { name: 'Download', exact: true }))
  await waitFor(() =>
    expect(execute.mock.calls.filter(([name]) => name === 'managed.install')).toHaveLength(2)
  )
  const requests = execute.mock.calls.filter(([name]) => name === 'managed.install').map(([, input]) => input)
  expect(requests[0]).toEqual(requests[1])
  expect(requests[1]).toMatchObject({ plan_digest: 'sglang' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('keeps Foundry variants inline, returns from accelerator preparation, and downloads the chosen variant', async () => {
  let prepared = false
  const model = () => ({
    model_id: 'phi',
    name: 'Phi',
    default_variant: 'phi-npu',
    unverified: false,
    variants: [
      {
        id: 'phi-npu',
        execution_provider: 'openvino',
        device: 'npu',
        size_bytes: 1000,
        verdict: {
          verdict: prepared ? 'ok' : 'accelerator-not-prepared',
          reason: null,
          accelerator: 'OpenVINOExecutionProvider',
        },
      },
    ],
  })
  const accelerators = () => ({
    installed: true,
    accelerators: [
      { name: 'OpenVINOExecutionProvider', execution_provider: 'openvino', device: 'npu', prepared },
    ],
    steps: [],
    preparing: false,
  })
  const { workspace, execute } = workspaceFixture({
    'engines.list': enginesList(['llamacpp-upstream', 'foundry-local']),
    'models.catalog': [],
    'models.installed': [],
    'artifacts.list': [],
    'models.search': () => ({ models: [model()] }),
    'foundry.accelerators': accelerators,
    'foundry.prepare': () => {
      prepared = true
      return accelerators()
    },
    'foundry.plan': { digest: 'foundry-plan', blockers: [], download_bytes: 1000 },
  })
  render(<Catalog workspace={workspace} openCommand={vi.fn()} />)
  await format('Foundry Local')
  await userEvent.click(await screen.findByText('Phi', { selector: 'strong' }))
  expect(screen.getByLabelText('Variant')).toHaveValue('phi-npu')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Prepare OpenVINO NPU' }))
  const dialog = within(await screen.findByRole('dialog', { name: 'Foundry Local', exact: true }))
  await userEvent.click(await dialog.findByRole('button', { name: 'Prepare OpenVINO NPU' }))
  await userEvent.click(dialog.getByRole('button', { name: 'Close' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Download', exact: true }))
  expect(screen.getByLabelText('Variant')).toHaveValue('phi-npu')
  expect(execute).toHaveBeenCalledWith('foundry.plan', { model: 'phi', variant: 'phi-npu' })
  expect(execute).toHaveBeenCalledWith('foundry.install', {
    request_id: expect.stringMatching(/^admin-/),
    plan_digest: 'foundry-plan',
  })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('keeps a blocked Foundry variant editable and retries a failed install without duplicating its request', async () => {
  let blocked = true,
    fail = true
  const { workspace, execute } = workspaceFixture({
    'foundry.plan': { digest: 'same-plan', blockers: [] },
    'foundry.install': () => {
      if (fail) throw new Error('Lost connection')
      return {}
    },
  })
  execute.mockImplementation(async (name, input) => {
    if (name === 'foundry.plan') return { digest: 'same-plan', blockers: blocked ? ['Free disk space'] : [] }
    if (name === 'foundry.install' && fail) throw new Error('Lost connection')
    return input ?? {}
  })
  const model = {
    model_id: 'phi',
    name: 'Phi',
    unverified: false,
    default_variant: 'cpu',
    variants: [
      {
        id: 'cpu',
        device: 'cpu',
        execution_provider: 'cpu',
        size_bytes: 1000,
        verdict: { verdict: 'ok', reason: null, accelerator: null },
      },
    ],
  }
  render(
    <FoundryModelInstall embedded workspace={workspace} model={model} onClose={vi.fn()} onFoundry={vi.fn()} />
  )
  await userEvent.click(screen.getByRole('button', { name: 'Download' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Free disk space')
  expect(execute).not.toHaveBeenCalledWith('foundry.install', expect.anything())
  blocked = false
  await userEvent.click(screen.getByRole('button', { name: 'Download' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Lost connection')
  expect(screen.getByLabelText('Variant')).toHaveValue('cpu')
  fail = false
  await userEvent.click(screen.getByRole('button', { name: 'Download' }))
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  const requests = execute.mock.calls.filter(([name]) => name === 'foundry.install').map(([, input]) => input)
  expect(requests).toHaveLength(2)
  expect(requests[0]).toEqual(requests[1])
})
