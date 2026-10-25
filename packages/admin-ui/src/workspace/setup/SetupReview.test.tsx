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

function review(answers: Record<string, unknown>) {
  const { workspace, execute } = workspaceFixture(answers)
  const onStarted = vi.fn(),
    onEngine = vi.fn()
  render(
    <SetupReview
      workspace={workspace}
      model={{ id: REPO, name: 'Qwen 2B' }}
      category="text"
      engine="vllm"
      technical={false}
      onClose={vi.fn()}
      onStarted={onStarted}
      onEngine={onEngine}
    />
  )
  return { execute, onStarted, onEngine }
}

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

it('leads to the install of the engine that would take the model when the chosen one refuses it', async () => {
  const refused = {
    ...ok,
    compatibility: {
      ...ok.compatibility,
      verdict: { ok: false, error: { code: 'MODEL_INCOMPATIBLE', message: 'vllm refuses it' } },
    },
  }
  const { onEngine } = review({
    'models.check': { repository: REPO, verdicts: [refused, { ...ok, engine: 'sglang', installed: false }] },
  })
  await userEvent.click(await screen.findByRole('button', { name: 'Install SGLang' }))
  expect(onEngine).toHaveBeenCalledWith('sglang')
})
