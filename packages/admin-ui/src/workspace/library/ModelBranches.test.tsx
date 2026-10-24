/** The admin's model install for managed engines and Foundry Local (spec managed-models-server, foundry-local-server). */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { enginesList, workspaceFixture } from '@/test/workspace-fixture'
import { Catalog } from './Catalog'
import { FoundryModelInstall } from './FoundryModelInstall'
import { InstalledModels } from './InstalledModels'
import { ManagedModelInstall } from './ManagedModelInstall'

const REPO = 'acme/Qwen3-8B-AWQ'
const verdict = (engine: string, installed: boolean, ok: boolean, message = '') => ({
  engine,
  installed,
  compatibility: {
    architectures: ['Qwen3ForCausalLM'],
    quantization_format: 'awq',
    weight_bytes: 5 * 1024 ** 3,
    checked_gpu_id: 'GPU-0',
    curated: false,
    unified_memory: false,
    fits_other_gpus: [],
    verdict: ok ? { ok: true } : { ok: false, error: { code: 'MODEL_INCOMPATIBLE', message } },
  },
  error: null,
})

describe('a managed engine’s model in the admin', () => {
  it('shows the installed engine’s refusal and offers to install the engine that would take it', async () => {
    const { workspace, execute } = workspaceFixture({
      'models.check': {
        repository: REPO,
        verdicts: [
          verdict('tensorrt-llm', true, false, 'AutoAWQ is not a format this release runs.'),
          verdict('vllm', false, true),
        ],
      },
    })
    const install = vi.fn()
    render(
      <ManagedModelInstall
        workspace={workspace}
        repository={REPO}
        onClose={() => {}}
        onInstallEngine={install}
      />
    )
    expect(
      await screen.findByText(/tensorrt-llm \(installed\): refused — AutoAWQ is not a format/)
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review download' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Install vLLM' }))
    expect(install).toHaveBeenCalledWith('vllm')
    expect(execute).not.toHaveBeenCalledWith('managed.plan', expect.anything())
  })

  it('downloads through the installed engine that takes it, after the plan', async () => {
    const { workspace, execute } = workspaceFixture({
      'models.check': { repository: REPO, verdicts: [verdict('vllm', true, true)] },
      'managed.plan': {
        digest: 'p1',
        repository: REPO,
        engine: 'vllm',
        download_bytes: 1024,
        free_bytes: null,
        root: '/m',
        blockers: [],
        verdict: verdict('vllm', true, true),
      },
      'managed.install': { id: 'job' },
    })
    const started = vi.fn()
    render(
      <ManagedModelInstall
        workspace={workspace}
        repository={REPO}
        onClose={() => {}}
        onStarted={started}
        onInstallEngine={() => {}}
      />
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Download' }))
    expect(execute).toHaveBeenCalledWith('managed.plan', { repository: REPO, engine: 'vllm' })
    expect(execute).toHaveBeenCalledWith('managed.install', {
      request_id: expect.stringMatching(/^admin-/),
      plan_digest: 'p1',
    })
    expect(started).toHaveBeenCalled()
  })
})

describe('a Foundry Local model in the admin', () => {
  const model = {
    origin: 'microsoft',
    model_id: 'phi-4-mini',
    name: 'Phi 4 mini',
    summary: '',
    license: 'mit',
    unverified: true,
    default_variant: 'phi-4-mini-openvino-npu',
    variants: [
      {
        id: 'phi-4-mini-openvino-npu',
        device: 'npu',
        execution_provider: 'openvino',
        asset_id: 'a',
        version: '1',
        size_bytes: 1024,
        verdict: {
          verdict: 'accelerator-not-prepared',
          reason: 'not prepared',
          accelerator: 'OpenVINOExecutionProvider',
        },
      },
      {
        id: 'phi-4-mini-cpu',
        device: 'cpu',
        execution_provider: 'cpu',
        asset_id: 'b',
        version: '1',
        size_bytes: 2048,
        verdict: { verdict: 'ok', reason: null, accelerator: null },
      },
    ],
  }

  it('marks a catalog model unverified, leads an unprepared accelerator to Prepare, and downloads a runnable variant', async () => {
    const { workspace, execute } = workspaceFixture({
      'foundry.plan': {
        digest: 'f1',
        variant_id: 'phi-4-mini-cpu',
        name: 'Phi 4 mini',
        device: 'cpu',
        execution_provider: 'cpu',
        files: [],
        pending: [],
        download_bytes: 2048,
        unverified: true,
        blockers: [],
        verdict: { verdict: 'ok', reason: null, accelerator: null },
      },
      'foundry.install': { id: 'job' },
    })
    const foundry = vi.fn()
    render(
      <FoundryModelInstall
        workspace={workspace}
        model={model as never}
        onClose={() => {}}
        onFoundry={foundry}
      />
    )
    expect(screen.getByText(/unverified/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Prepare OpenVINO NPU' }))
    expect(foundry).toHaveBeenCalled()
    await userEvent.selectOptions(screen.getByLabelText('Variant'), 'phi-4-mini-cpu')
    await userEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(execute).toHaveBeenCalledWith('foundry.plan', { model: 'phi-4-mini', variant: 'phi-4-mini-cpu' })
    expect(execute).toHaveBeenCalledWith('foundry.install', {
      request_id: expect.stringMatching(/^admin-/),
      plan_digest: 'f1',
    })
  })

  it('leads a variant without the engine to its installation', async () => {
    const { workspace } = workspaceFixture({})
    const absent = {
      ...model,
      default_variant: 'phi-4-mini-cpu',
      variants: [
        {
          ...model.variants[1]!,
          verdict: { verdict: 'engine-not-installed', reason: null, accelerator: null },
        },
      ],
    }
    const foundry = vi.fn()
    render(
      <FoundryModelInstall
        workspace={workspace}
        model={absent as never}
        onClose={() => {}}
        onFoundry={foundry}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Install Foundry Local' }))
    expect(foundry).toHaveBeenCalled()
  })
})

describe('the admin catalog and installed models', () => {
  it('filters chat models by format, listing a managed engine’s curated checkpoints', async () => {
    const { workspace, execute } = workspaceFixture({
      'engines.list': enginesList(['llamacpp-upstream', 'vllm', 'foundry-local']),
      'models.catalog': (i: Record<string, unknown>) =>
        i['engine'] === 'vllm'
          ? { engine: 'vllm', models: [{ repository: REPO, note: 'AWQ 8B', vram_tier_bytes: 0 }] }
          : { rows: [] },
      'models.installed': [],
      'artifacts.list': [],
      'models.check': { repository: REPO, verdicts: [] },
    })
    render(<Catalog workspace={workspace} openCommand={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Local models' }))
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    await userEvent.click(await screen.findByRole('radio', { name: 'Safetensors' }))
    await userEvent.keyboard('{Escape}')
    expect(execute).toHaveBeenCalledWith('models.catalog', { engine: 'vllm' })
    await userEvent.click(await screen.findByText(REPO, { selector: 'strong' }))
    await waitFor(() => expect(execute).toHaveBeenCalledWith('models.check', { repository: REPO }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Compatibility')).toBeInTheDocument()
  })

  it('goes back to the category catalog when the task changes after another format was chosen', async () => {
    const { workspace, execute } = workspaceFixture({
      'engines.list': enginesList(['llamacpp-upstream', 'vllm']),
      'models.catalog': { rows: [] },
      'models.installed': [],
      'artifacts.list': [],
    })
    render(<Catalog workspace={workspace} openCommand={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Local models' }))
    await userEvent.click(screen.getByRole('button', { name: 'Filters' }))
    await userEvent.click(await screen.findByRole('radio', { name: 'Safetensors' }))
    await userEvent.click(screen.getByRole('combobox', { name: 'Model category' }))
    await userEvent.click(screen.getByRole('option', { name: /Images/ }))
    await waitFor(() => expect(execute).toHaveBeenCalledWith('models.catalog', { category: 'image' }))
  })

  it('leads a repository without GGUF to the managed engines’ verdicts instead of “No GGUF”', async () => {
    const { workspace, execute } = workspaceFixture({
      'engines.list': enginesList(['llamacpp-upstream', 'vllm']),
      'models.catalog': { rows: [{ id: REPO, name: REPO, category: 'text', source: { format: 'gguf' } }] },
      'models.files': () => {
        throw Object.assign(new Error(`No GGUF files found in Hugging Face repo ${REPO}`), {
          code: 'MODEL_NOT_FOUND',
        })
      },
      'models.check': { repository: REPO, verdicts: [verdict('vllm', true, true)] },
      'models.installed': [],
      'artifacts.list': [],
    })
    render(<Catalog workspace={workspace} openCommand={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Local models' }))
    await userEvent.click(await screen.findByText(REPO, { selector: 'strong' }))
    await waitFor(() => expect(execute).toHaveBeenCalledWith('models.check', { repository: REPO }))
    expect(screen.queryByText(/No GGUF/)).toBeNull()
    expect(await screen.findByRole('button', { name: 'Download' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('warns that removing a store model removes it for every managed engine', async () => {
    const { workspace, execute } = workspaceFixture({ 'models.remove': {} })
    const store = { id: REPO, name: REPO, provider: 'vllm', providers: ['vllm', 'sglang'], store: 'managed' }
    render(
      <InstalledModels
        workspace={workspace}
        installed={[store]}
        loading={false}
        openCommand={() => {}}
        browse={() => {}}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: '× Delete' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('every engine using the shared store')
    await userEvent.click(screen.getByRole('button', { name: 'Delete model' }))
    expect(execute).toHaveBeenCalledWith('models.remove', { model_id: REPO })
  })
})
