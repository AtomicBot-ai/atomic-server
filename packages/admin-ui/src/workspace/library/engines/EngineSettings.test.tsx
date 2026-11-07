/** Engine settings in the admin («Выбор карты в admin», spec server-engine-settings). */
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { settingsSchema } from '@atomic-chat/core/settings'
import { workspaceFixture } from '@/test/workspace-fixture'
import { EngineSettings } from './EngineSettings'
import userEvent from '@testing-library/user-event'

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

describe('audio.cpp in the admin', () => {
  const engine = {
    engine: 'audio-cpp',
    kind: 'engine-build',
    builds: [{ version: 'v0.9.3', variant: 'macos-arm64', active: true, removable: true }],
    active: { version: 'v0.9.3', variant: 'macos-arm64' },
    active_choice: 'core',
  }

  it('offers builds and asks for no settings: they go with each task', async () => {
    const { workspace, execute } = workspaceFixture({ 'engines.list': { engines: [engine] } })
    render(<EngineSettings provider="audio-cpp" workspace={workspace} onClose={() => {}} />)
    expect(await screen.findByText('v0.9.3')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'audio.cpp' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Settings' }))
    expect(screen.getByText('Generation settings are sent with each audio task.')).toBeInTheDocument()
    expect(execute).not.toHaveBeenCalledWith('settings.get', expect.anything())
    expect(execute).not.toHaveBeenCalledWith('settings.schema', expect.anything())
  })

  it('installs through the engine queue', async () => {
    const { workspace, execute } = workspaceFixture({
      'engines.list': { engines: [{ ...engine, builds: [], active: null }] },
    })
    render(<EngineSettings provider="audio-cpp" workspace={workspace} onClose={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Install engine' }))
    expect(execute).toHaveBeenCalledWith('engines.enqueue', { engine: 'audio-cpp' })
  })
})

describe('engine settings in the admin', () => {
  it('picks the card for vLLM among the environment’s two cards, with name, compute capability and memory', async () => {
    const { workspace } = workspaceFixture({
      'settings.get': { revision: 1, values: {} },
      'settings.schema': { descriptors: settingsSchema('vllm') },
      'environments.list': [{ gpus: GPUS }],
    })
    render(<EngineSettings provider="vllm" workspace={workspace} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Settings' }))
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
    await userEvent.click(screen.getByRole('tab', { name: 'Settings' }))
    const select = await screen.findByLabelText('GPU card')
    expect(select).toBeDisabled()
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent)
    ).toEqual(['Card with the most free memory'])
  })
})

it('shows Save only after an actual change and hides it after revert or save', async () => {
  let values = { threads: 2, args: ['a'] }
  const { workspace } = workspaceFixture({
    'settings.get': () => ({ revision: 1, values }),
    'settings.schema': {
      descriptors: [
        {
          key: 'threads',
          title: 'Threads',
          controllerType: 'input',
          controllerProps: { type: 'number', value: 2 },
        },
      ],
    },
    'settings.update': (input: Record<string, unknown>) => {
      values = { ...values, ...(input.values as object) }
      return { revision: 2 }
    },
  })
  render(<EngineSettings provider="llamacpp-upstream" workspace={workspace} onClose={() => {}} />)
  await userEvent.click(screen.getByRole('tab', { name: 'Settings' }))
  const field = await screen.findByLabelText('Threads')
  expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  await userEvent.clear(field)
  await userEvent.type(field, '4')
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  await userEvent.clear(field)
  await userEvent.type(field, '2')
  expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  await userEvent.clear(field)
  await userEvent.type(field, '8')
  await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('Saved')
})

it('removes Save and changed markers when an implicit Off default is restored', async () => {
  const { workspace } = workspaceFixture({
    'settings.get': { revision: 1, values: {} },
    'settings.schema': {
      descriptors: [
        { key: 'mtp', title: 'Enable MTP', controllerType: 'checkbox', controllerProps: { value: false } },
      ],
    },
  })
  render(<EngineSettings provider="llamacpp-upstream" workspace={workspace} onClose={() => {}} />)
  await userEvent.click(screen.getByRole('tab', { name: 'Settings' }))
  const field = await screen.findByLabelText('Enable MTP')
  expect(field).toHaveValue('false')
  await userEvent.selectOptions(field, 'true')
  expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
  expect(screen.getByText('Review changes (1)')).toBeInTheDocument()
  await userEvent.selectOptions(field, 'false')
  expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  expect(screen.queryByText('Review changes (0)')).not.toBeInTheDocument()
  expect(field.closest('.engine-setting')).not.toHaveClass('setting-changed')
  expect(screen.queryByText('Details & default · changed')).not.toBeInTheDocument()
})
