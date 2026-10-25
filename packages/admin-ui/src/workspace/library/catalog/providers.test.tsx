/** Provider lists in the admin come from the core (spec server-engine-settings, «SGLang в admin», «macOS»). */
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { InstalledModels } from './InstalledModels'
import { Downloads } from '../downloads/Downloads'
import { loadTarget } from '../downloads/download-data'

const options = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((o) => o.getAttribute('value'))

describe('provider lists from the core', () => {
  it('offers a store model’s load under each provider that lists it, SGLang among them', async () => {
    const { workspace, execute } = workspaceFixture({})
    const store = {
      id: 'Qwen/Qwen3.5-2B',
      name: 'Qwen',
      provider: 'vllm',
      providers: ['vllm', 'sglang'],
      store: 'managed',
    }
    render(
      <InstalledModels
        workspace={workspace}
        installed={[store]}
        loading={false}
        openCommand={() => {}}
        browse={() => {}}
      />
    )
    const select = screen.getByLabelText('Load Qwen/Qwen3.5-2B with')
    expect(options(select)).toEqual(['vllm', 'sglang'])
    await userEvent.selectOptions(select, 'sglang')
    await userEvent.click(screen.getByRole('button', { name: 'Load model' }))
    expect(execute).toHaveBeenCalledWith('models.load', { provider: 'sglang', model_id: 'Qwen/Qwen3.5-2B' })
  })

  it('resumes an interrupted store download and cancels a running Foundry one with their own operations', async () => {
    const { workspace, execute } = workspaceFixture(
      {},
      {
        setups: [
          {
            id: 'm1',
            kind: 'managed-model',
            stage: 'interrupted',
            plan: { digest: 'pd', engine: 'vllm', repository: 'Qwen/Qwen3.5-2B' },
          },
          {
            id: 'f1',
            kind: 'foundry-model',
            stage: 'downloading',
            plan: { digest: 'pf', variant_id: 'phi-cpu' },
          },
        ] as never,
      }
    )
    render(<Downloads workspace={workspace} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Resume' }))
    expect(execute).toHaveBeenCalledWith('managed.install', { request_id: 'm1', plan_digest: 'pd' })
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(execute).toHaveBeenCalledWith('foundry.cancel', { id: 'f1' })
  })

  it('names the engine and model a finished job loads with, from its plan', () => {
    expect(
      loadTarget({ kind: 'managed-model', plan: { engine: 'sglang', repository: 'Qwen/Qwen3.5-2B' } })
    ).toEqual({
      provider: 'sglang',
      model_id: 'Qwen/Qwen3.5-2B',
    })
    expect(loadTarget({ kind: 'foundry-model', plan: { variant_id: 'phi-cpu' } })).toEqual({
      provider: 'foundry-local',
      model_id: 'phi-cpu',
    })
    expect(loadTarget({ plan: { provider: 'llamacpp', model_id: 'gemma' } })).toEqual({
      provider: 'llamacpp',
      model_id: 'gemma',
    })
  })
})
