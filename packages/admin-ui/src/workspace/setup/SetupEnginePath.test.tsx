/** The admin SetupWizard with a managed engine or Foundry Local (spec managed-models-server, foundry-local-server). */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { enginesList, snapshotFixture, workspaceFixture } from '@/test/workspace-fixture'
import { SetupWizard } from './SetupWizard'

const REPO = 'Qwen/Qwen3.5-2B'
const LINUX = ['llamacpp-upstream', 'vllm', 'foundry-local']
const ok = {
  engine: 'vllm',
  installed: true,
  compatibility: {
    architectures: ['Qwen3ForCausalLM'],
    quantization_format: null,
    weight_bytes: 1024,
    checked_gpu_id: 'GPU-0',
    curated: true,
    unified_memory: false,
    fits_other_gpus: [],
    verdict: { ok: true },
  },
  error: null,
}

async function chooseEngine(engine: string) {
  await waitFor(() => expect(screen.getByLabelText('Setup engine')).toBeEnabled())
  await userEvent.selectOptions(screen.getByLabelText('Setup engine'), engine)
  await userEvent.click(screen.getByRole('button', { name: 'Choose models for this engine' }))
}

describe('the admin setup wizard with a managed engine', () => {
  it('installs an engine that is not installed inside the wizard first', async () => {
    const { workspace } = workspaceFixture({
      'engines.list': enginesList(LINUX, ['llamacpp-upstream']),
      'engines.plan': { engine: 'vllm', plan: null, installation: null, operation: null },
      'config.get': {},
    })
    render(<SetupWizard workspace={workspace} onClose={() => {}} onOpenGoal={() => {}} />)
    await chooseEngine('vllm')
    await userEvent.click(await screen.findByRole('button', { name: 'Install vLLM' }))
    expect(await screen.findByRole('dialog', { name: 'vLLM setup' })).toBeInTheDocument()
  })

  it('leads to the install of the engine that would take the model when no installed one does', async () => {
    const refused = {
      ...ok,
      compatibility: {
        ...ok.compatibility,
        verdict: { ok: false, error: { code: 'MODEL_INCOMPATIBLE', message: 'vllm refuses it' } },
      },
    }
    const { workspace } = workspaceFixture({
      'engines.list': enginesList(['llamacpp-upstream', 'vllm', 'sglang'], ['llamacpp-upstream', 'vllm']),
      'models.catalog': (i: Record<string, unknown>) =>
        i['engine'] === 'vllm'
          ? { engine: 'vllm', models: [{ repository: REPO, note: 'Qwen 2B', vram_tier_bytes: 0 }] }
          : { rows: [] },
      'models.check': {
        repository: REPO,
        verdicts: [refused, { ...ok, engine: 'sglang', installed: false }],
      },
      'engines.plan': { engine: 'sglang', plan: null, installation: null, operation: null },
      'config.get': {},
    })
    render(<SetupWizard workspace={workspace} onClose={() => {}} onOpenGoal={() => {}} />)
    await chooseEngine('vllm')
    await waitFor(() => expect(screen.getByLabelText('Setup model')).toHaveTextContent(REPO))
    await userEvent.selectOptions(screen.getByLabelText('Setup model'), REPO)
    await userEvent.click(screen.getByRole('button', { name: 'Review model' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Install SGLang' }))
    // Back on the Engine step with SGLang chosen: its install, as for an engine chosen there.
    await userEvent.click(await screen.findByRole('button', { name: 'Install SGLang' }))
    expect(await screen.findByRole('dialog', { name: 'SGLang setup' })).toBeInTheDocument()
  })

  it('takes a vLLM model through its verdict and plan, then loads it with vLLM', async () => {
    const { workspace, execute } = workspaceFixture({
      'engines.list': enginesList(LINUX),
      'models.catalog': (i: Record<string, unknown>) =>
        i['engine'] === 'vllm'
          ? { engine: 'vllm', models: [{ repository: REPO, note: 'Qwen 2B', vram_tier_bytes: 0 }] }
          : { rows: [] },
      'models.check': { repository: REPO, verdicts: [ok] },
      'managed.plan': {
        digest: 'p1',
        repository: REPO,
        engine: 'vllm',
        download_bytes: 1024,
        free_bytes: null,
        root: '/m',
        blockers: [],
        verdict: ok,
      },
      'config.get': { values: { api: { host: '127.0.0.1', port: 1337, prefix: '/v1' } } },
    })
    const ui = render(<SetupWizard workspace={workspace} onClose={() => {}} onOpenGoal={() => {}} />)
    await chooseEngine('vllm')
    expect(execute).toHaveBeenCalledWith('models.catalog', { engine: 'vllm' })
    await waitFor(() => expect(screen.getByLabelText('Setup model')).toHaveTextContent(REPO))
    await userEvent.selectOptions(screen.getByLabelText('Setup model'), REPO)
    await userEvent.click(screen.getByRole('button', { name: 'Review model' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Review download' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Download' }))
    const install = execute.mock.calls.find(([n]) => n === 'managed.install')![1] as { request_id: string }
    workspace.snapshot = snapshotFixture({
      setups: [
        {
          id: install.request_id,
          kind: 'managed-model',
          stage: 'ready',
          plan: { engine: 'vllm', repository: REPO },
        },
      ] as never,
    })
    await act(async () =>
      ui.rerender(<SetupWizard workspace={{ ...workspace }} onClose={() => {}} onOpenGoal={() => {}} />)
    )
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith('models.load', { provider: 'vllm', model_id: REPO })
    )
    await waitFor(() => expect(execute).toHaveBeenCalledWith('setup.complete', { model_id: REPO }))
  })
})

describe('the admin setup wizard with LiteRT-LM', () => {
  it('says the models are loading inside the list while the search runs, then lists them', async () => {
    let answer: (value: unknown) => void = () => {}
    const { workspace } = workspaceFixture({
      'engines.list': enginesList(['llamacpp-upstream', 'litert-lm']),
      'models.search': () => new Promise((resolve) => (answer = resolve)),
      'config.get': {},
    })
    render(<SetupWizard workspace={workspace} onClose={() => {}} onOpenGoal={() => {}} />)
    await chooseEngine('litert-lm')
    const list = await screen.findByLabelText('Setup model')
    expect(list.querySelector('option')?.textContent).toBe('Loading models…')
    await act(async () =>
      answer({
        models: [
          { model_id: 'gemma-4-e2b', name: 'Gemma 4 E2B', default_variant: 'gemma-4-e2b-cpu', variants: [] },
        ],
      })
    )
    await waitFor(() => expect(list.querySelector('option')?.textContent).toBe('Choose a model'))
    expect(screen.getByRole('option', { name: 'Gemma 4 E2B' })).toBeInTheDocument()
  })
})
