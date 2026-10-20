/** Engine settings in the admin («Выбор карты в admin», spec server-engine-settings). */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { settingsSchema } from '@atomic-chat/core/settings'
import { workspaceFixture } from '@/test/workspace-fixture'
import { EngineSettings } from './EngineSettings'

const GPUS = [
  {
    gpu_id: 'GPU-a',
    name: 'NVIDIA RTX 4090',
    compute_capability: '8.9',
    total_vram_bytes: 24 * 1024 ** 3,
    free_vram_bytes: null,
    driver_version: null,
  },
  {
    gpu_id: 'GPU-b',
    name: 'NVIDIA RTX 3060',
    compute_capability: '8.6',
    total_vram_bytes: 12 * 1024 ** 3,
    free_vram_bytes: null,
    driver_version: null,
  },
]

describe('engine settings in the admin', () => {
  it('picks the card for vLLM among the environment’s two cards, with name, compute capability and memory', async () => {
    const { workspace } = workspaceFixture({
      'settings.get': { revision: 1, values: {} },
      'settings.schema': { descriptors: settingsSchema('vllm') },
      'environments.list': [{ gpus: GPUS }],
    })
    render(<EngineSettings provider="vllm" workspace={workspace} onClose={() => {}} />)
    const select = await screen.findByLabelText('GPU card')
    const labels = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(labels).toEqual([
      'Card with the most free memory',
      'NVIDIA RTX 4090 (CC 8.9, 24.0 GiB)',
      'NVIDIA RTX 3060 (CC 8.6, 12.0 GiB)',
    ])
  })
})

describe('gpu_id without cards in the admin', () => {
  it('is shown, not typed, when the environment reports no card', async () => {
    const { workspace } = workspaceFixture({
      'settings.get': { revision: 1, values: {} },
      'settings.schema': { descriptors: settingsSchema('vllm') },
      'environments.list': [{ gpus: [] }],
    })
    render(<EngineSettings provider="vllm" workspace={workspace} onClose={() => {}} />)
    const select = await screen.findByLabelText('GPU card')
    expect(select).toBeDisabled()
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['Card with the most free memory'])
  })
})
