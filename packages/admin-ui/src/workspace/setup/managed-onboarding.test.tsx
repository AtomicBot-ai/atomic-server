import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { ManagedEngineState } from '@contract'
import { enginesList, workspaceFixture } from '@/test/workspace-fixture'
import { installation, plan } from '../../../../../test/helpers/managed-fixtures'
import { useWorkspace } from '../useWorkspace'
import { EngineIntro } from '../intro/EngineIntro'
import { SetupWizard } from './SetupWizard'
import { WorkspaceApp } from '../WorkspaceApp'
import { workspaceApi } from '../workspace-api'

vi.mock('../useWorkspace', () => ({ useWorkspace: vi.fn() }))
vi.mock('@/hooks/useServiceHub', async (original) => ({
  ...(await original<typeof import('@/hooks/useServiceHub')>()),
  useServiceHub: () => ({}),
}))
const managedState = (engine: string, ready = false): ManagedEngineState => ({
  engine,
  environment_id: 'default',
  executor: 'linux-docker',
  plan: plan(engine),
  plan_error: null,
  notices: [],
  installation: ready ? installation(engine) : null,
  operation: null,
  other_operation: null,
  failed: null,
  models_kept_for: [],
  update: null,
})
const verdict = (engine: string, installed: boolean) => ({
  engine,
  installed,
  compatibility: {
    verdict: { ok: true },
    fits_other_gpus: [],
    architectures: ['Qwen3ForCausalLM'],
    quantization_format: null,
    weight_bytes: 1024,
    checked_gpu_id: 'GPU-0',
    curated: true,
    unified_memory: false,
  },
  error: null,
})

it.each([
  ['sglang', 'SGLang'],
  ['vllm', 'vLLM'],
  ['tensorrt-llm', 'TensorRT-LLM'],
])('installs %s before selecting it and continuing to models', async (engine, label) => {
  let ready = false
  const { workspace, execute } = workspaceFixture(
    {
      'engines.list': enginesList([engine], []),
      'engines.plan': () => managedState(engine, ready),
      'engines.operate': () => {
        ready = true
        workspace.snapshot!.engines = [{ engine, installation: installation(engine), operation: null }]
      },
    },
    { setup: null }
  )
  vi.mocked(useWorkspace).mockReturnValue(workspace)
  const next = vi.fn()
  render(<EngineIntro onContinue={next} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Choose engine' }))
  await userEvent.click(await screen.findByRole('button', { name: label }))
  expect(screen.queryByRole('button', { name: 'Choose models' })).not.toBeInTheDocument()
  await userEvent.click(await screen.findByRole('button', { name: 'Agree and install' }))
  const proceed = await screen.findByRole('button', { name: 'Choose models' })
  expect(next).not.toHaveBeenCalled()
  expect(execute.mock.calls.some(([name]) => name === 'engines.select' || name === 'engines.enqueue')).toBe(
    false
  )
  await userEvent.click(proceed)
  await waitFor(() => expect(next).toHaveBeenCalledOnce())
  expect(execute).toHaveBeenCalledWith('engines.select', { engine })
})

it.each(['Escape', 'Back'])(
  'returns from models via %s, closes a blocked panel, then changes engine',
  async (back) => {
    let selected = 'sglang'
    const { workspace, execute } = workspaceFixture(
      {
        'engines.list': enginesList(['sglang', 'vllm', 'tensorrt-llm'], ['sglang', 'vllm']),
        'engines.selected': () => ({ engine: selected }),
        'engines.select': ({ engine }: { engine: string }) => {
          selected = engine
        },
        'models.catalog': ({ engine }: { engine: string }) => ({
          models: [{ repository: `${engine}/First` }, { repository: `${engine}/Second` }],
        }),
        'models.installed': [],
        'engines.plan': () => ({
          ...managedState('tensorrt-llm'),
          plan: plan('tensorrt-llm', {
            availability: 'prerequisite-blocked',
            blockers: [{ code: 'INVALID_ARGUMENT', message: 'No NVIDIA GPU available' }],
          }),
        }),
      },
      { setup: null }
    )
    vi.mocked(useWorkspace).mockReturnValue(workspace)
    render(<SetupWizard workspace={workspace} onClose={vi.fn()} onOpenGoal={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: /sglang\/Second/ }))
    if (back === 'Escape') await userEvent.keyboard('{Escape}')
    else await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    await userEvent.click(await screen.findByRole('button', { name: 'TensorRT-LLM' }))
    await screen.findByText(/blocked: No NVIDIA GPU available/)
    await userEvent.keyboard('{Escape}')
    const chooser = screen.getByRole('dialog', { name: 'Choose your engine' })
    expect(chooser).toContainElement(document.activeElement as HTMLElement)
    await userEvent.click(within(chooser).getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('button', { name: /sglang\/Second/ })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    await userEvent.click(await screen.findByRole('button', { name: 'vLLM · Installed' }))
    await screen.findByRole('button', { name: /vllm\/First/ })
    expect(screen.queryByRole('button', { name: /sglang\/Second/ })).not.toBeInTheDocument()
    expect(execute).toHaveBeenCalledWith('models.catalog', { engine: 'vllm' })
    expect(execute.mock.calls.some(([name]) => /engines\.(operate|enqueue|cancel)/.test(name))).toBe(false)
  }
)

it('installs from model review, refreshes compatibility, downloads and advances to permissions', async () => {
  let ready = false
  const { workspace, execute } = workspaceFixture(
    {
      'engines.selected': { engine: 'sglang' },
      'models.installed': [],
      'models.catalog': { models: [{ repository: 'Qwen/Example' }] },
      'models.check': () => ({ verdicts: [verdict('sglang', ready)] }),
      'engines.plan': () => managedState('sglang', ready),
      'engines.operate': () => {
        ready = true
        workspace.snapshot!.engines = [
          { engine: 'sglang', installation: installation('sglang'), operation: null },
        ]
      },
      'managed.plan': { digest: 'model-plan', blockers: [], download_bytes: 1024 },
      'managed.install': {},
    },
    { setup: null }
  )
  render(<SetupWizard workspace={workspace} onClose={vi.fn()} onOpenGoal={vi.fn()} />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Install SGLang' }))
  await screen.findByRole('button', { name: 'Agree and install' })
  await userEvent.keyboard('{Escape}')
  expect(screen.getByRole('dialog', { name: 'Install Qwen/Example' })).toBeInTheDocument()
  await userEvent.click(await screen.findByRole('button', { name: 'Install SGLang' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Agree and install' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Choose models' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Download' }))
  expect(execute).toHaveBeenCalledWith('managed.plan', { repository: 'Qwen/Example', engine: 'sglang' })
  expect(execute).toHaveBeenCalledWith('config.update', { values: { 'tui.model': 'Qwen/Example' } })
  await screen.findByRole('heading', { name: 'Permissions' })
  expect(screen.queryByRole('dialog', { name: 'Install Qwen/Example' })).not.toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  await screen.findByRole('heading', { name: 'Choose your first model' })
})

it('keeps the ready panel open while saving its selection, then advances once', async () => {
  let finish!: () => void
  const { workspace } = workspaceFixture(
    {
      'engines.list': enginesList(['sglang'], []),
      'engines.plan': managedState('sglang', true),
      'engines.select': () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    },
    { setup: null, engines: [{ engine: 'sglang', installation: installation('sglang'), operation: null }] }
  )
  vi.mocked(useWorkspace).mockReturnValue(workspace)
  const next = vi.fn()
  render(<EngineIntro onContinue={next} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Choose engine' }))
  await userEvent.click(await screen.findByRole('button', { name: 'SGLang' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Choose models' }))
  await userEvent.keyboard('{Escape}')
  const panel = screen.getByRole('dialog', { name: 'SGLang setup' })
  expect(within(panel).getByRole('button', { name: 'Close' })).toBeDisabled()
  expect(next).not.toHaveBeenCalled()
  finish()
  await waitFor(() => expect(next).toHaveBeenCalledOnce())
})

it('opens the installed engine catalog in the full workspace and returns to the chooser', async () => {
  let selected = ''
  let ready = false
  const { workspace, execute } = workspaceFixture(
    {
      'engines.list': () => enginesList(['sglang'], ready ? ['sglang'] : []),
      'engines.plan': () => managedState('sglang', ready),
      'engines.operate': () => {
        ready = true
        workspace.snapshot!.engines = [
          { engine: 'sglang', installation: installation('sglang'), operation: null },
        ]
      },
      'engines.select': ({ engine }: { engine: string }) => {
        selected = engine
      },
      'engines.selected': () => ({ engine: selected }),
      'models.catalog': ({ engine }: { engine: string }) => ({
        models: [{ repository: `${engine}/Example` }],
      }),
      'models.installed': [],
    },
    { setup: null }
  )
  vi.mocked(useWorkspace).mockReturnValue(workspace)
  const api = vi.spyOn(workspaceApi, 'execute').mockResolvedValue([] as never)
  try {
    render(<WorkspaceApp />)
    await userEvent.click(await screen.findByRole('button', { name: 'Choose engine' }))
    await userEvent.click(await screen.findByRole('button', { name: 'SGLang' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Agree and install' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Choose models' }))
    await screen.findByRole('heading', { name: 'Choose your first model' })
    await screen.findByRole('button', { name: /sglang\/Example/ })
    expect(execute).toHaveBeenCalledWith('models.catalog', { engine: 'sglang' })
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    await screen.findByRole('button', { name: 'SGLang · Installed' })
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: /sglang\/Example/ })).toHaveAttribute('aria-pressed', 'true')
  } finally {
    api.mockRestore()
  }
})
