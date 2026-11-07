/** The first-run wizard's review of a managed engine's model (spec managed-models-server). */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { SetupReview } from './SetupReview'

const REPO = 'Qwen/Qwen3.5-2B'
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
const plan = {
  digest: 'p1',
  repository: REPO,
  engine: 'vllm',
  download_bytes: 1024,
  free_bytes: null,
  root: '/m',
  blockers: [],
  verdict: ok,
}

function review(answers: Record<string, unknown>, engine = 'vllm') {
  const { workspace, execute } = workspaceFixture(answers)
  const onStarted = vi.fn(),
    onEngine = vi.fn()
  render(
    <SetupReview
      workspace={workspace}
      model={{ id: REPO, name: 'Qwen 2B' }}
      category="text"
      engine={engine}
      technical={false}
      onClose={vi.fn()}
      onStarted={onStarted}
      onEngine={onEngine}
    />
  )
  return { execute, onStarted, onEngine }
}

it.each(['sglang', 'tensorrt-llm'])('keeps the selected %s when vLLM is also installed', async (engine) => {
  const { execute } = review(
    {
      'models.check': { repository: REPO, verdicts: [ok, { ...ok, engine }] },
      'managed.plan': { ...plan, engine },
      'managed.install': { id: 'job' },
    },
    engine
  )
  await userEvent.click(await screen.findByRole('button', { name: 'Download' }))
  await waitFor(() => expect(execute).toHaveBeenCalledWith('managed.plan', { repository: REPO, engine }))
})

it('explains an unavailable selected engine without silently switching to an installed alternative', async () => {
  review(
    {
      'models.check': {
        repository: REPO,
        verdicts: [
          ok,
          {
            ...ok,
            engine: 'sglang',
            compatibility: null,
            error: { code: 'MODEL_INCOMPATIBLE', message: 'Unsupported architecture' },
          },
        ],
      },
    },
    'sglang'
  )
  expect(await screen.findByRole('alert')).toHaveTextContent('SGLang')
  expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Choose another model' })).toBeInTheDocument()
})

it('takes a vLLM model through its verdict and plan, then hands the wizard the download and the model', async () => {
  const { execute, onStarted } = review({
    'models.check': { repository: REPO, verdicts: [ok] },
    'managed.plan': plan,
    'managed.install': { id: 'job-1' },
  })
  await userEvent.click(await screen.findByRole('button', { name: 'Download' }))
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith('managed.install', expect.objectContaining({ plan_digest: 'p1' }))
  )
  await waitFor(() => expect(onStarted).toHaveBeenCalledWith(expect.any(String), REPO))
  expect(onStarted.mock.calls[0]![0]).not.toBe('')
})

it.each([false, true])(
  'offers only the selected missing engine with another installed=%s',
  async (installed) => {
    const { onEngine } = review(
      {
        'models.check': {
          verdicts: [
            { ...ok, installed },
            { ...ok, engine: 'sglang', installed: false },
          ],
        },
      },
      'sglang'
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Install SGLang' }))
    expect(onEngine).toHaveBeenCalledWith('sglang')
    expect(screen.queryByRole('button', { name: 'Install vLLM' })).not.toBeInTheDocument()
  }
)

it('keeps incompatible model review on the chosen engine instead of offering another runtime', async () => {
  review({
    'models.check': {
      verdicts: [
        { ...ok, compatibility: null, error: { code: 'MODEL_INCOMPATIBLE', message: 'vllm refuses it' } },
        { ...ok, engine: 'sglang', installed: false },
      ],
    },
  })
  await screen.findByRole('alert')
  expect(screen.queryByRole('button', { name: 'Install SGLang' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Choose another model' })).toBeInTheDocument()
})
