import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { AdminApiError } from '@/services/admin-api'
import { workspaceFixture } from '@/test/workspace-fixture'
import { AudioStudio } from './AudioStudio'
import { useAudioSelection } from './useAudioSelection'

const MODEL = 'stable-audio-3-small-sfx:q8_0'
const capabilities = { modelId: MODEL, mode: 'effects', voices: [] }
const model = { modelId: MODEL, mode: 'effects', displayName: 'Stable Audio' }
const service = {
  id: 'audio',
  kind: 'audio' as const,
  provider: 'audio-cpp',
  model: MODEL,
  state: 'loaded',
  details: { model: { state: 'loaded', loaded: model } },
}
const download = {
  id: 'download',
  stage: 'ready',
  plan: {
    model_id: MODEL,
    name: 'Stable Audio',
    category: 'audio',
    audio: {
      mode: 'effects',
      controls: ['durationSec', 'seed'],
      defaults: { durationSec: 5, seed: 42 },
      ranges: { durationSec: [1, 30] },
      attribution: null,
    },
  },
}
const answer = {
  'audio.gallery': { items: [] },
  'audio.capabilities': capabilities,
  'audio.generate': { id: 'j1', state: 'generating' },
  'audio.cancel': { cancelled: true, serverStopped: true },
  'audio.job': { job: { id: 'j1', state: 'cancelled' } },
}

it('keeps the model, text and controls after Stop, then starts the next clip with them', async () => {
  const { workspace, execute } = workspaceFixture(answer, { services: [service], setups: [download] })
  const view = render(<AudioStudio workspace={workspace} onCatalog={vi.fn()} />)
  await userEvent.type(await screen.findByRole('textbox', { name: 'Describe the sound' }), 'A soft click')
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Length (seconds)' }), { target: { value: '7' } })
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Seed' }), { target: { value: '123' } })
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await userEvent.click(screen.getByRole('button', { name: 'Stop' }))
  await userEvent.click(screen.getByRole('button', { name: 'Stop generation' }))
  await waitFor(() => expect(execute).toHaveBeenCalledWith('audio.cancel', { id: 'j1' }))
  const stopped = { ...workspace, snapshot: { ...workspace.snapshot!, captured_at: 2, services: [] } }
  view.rerender(<AudioStudio workspace={stopped} onCatalog={vi.fn()} />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled())
  expect(screen.getByRole('textbox', { name: 'Describe the sound' })).toHaveValue('A soft click')
  expect(screen.getByRole('spinbutton', { name: 'Length (seconds)' })).toHaveValue(7)
  expect(screen.getByRole('spinbutton', { name: 'Seed' })).toHaveValue(123)
  expect(screen.getByRole('button', { name: 'Stable Audio' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(execute).toHaveBeenLastCalledWith('audio.generate', {
    mode: 'effects',
    request: { text: 'A soft click', durationSec: 7, seed: 123 },
  })
})

it('recovers the selected model when the studio opens after another client stopped its engine', async () => {
  const { workspace } = workspaceFixture(answer, { setups: [download] })
  render(<AudioStudio workspace={workspace} onCatalog={vi.fn()} />)
  expect(await screen.findByRole('button', { name: 'Stable Audio' })).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Describe the sound' })).toBeInTheDocument()
  expect(screen.getByRole('spinbutton', { name: 'Length (seconds)' })).toHaveValue(5)
})

it('forgets a retained model after an explicit unload instead of keeping a stale selection', async () => {
  let selected = true
  const { workspace } = workspaceFixture(
    {
      ...answer,
      'audio.capabilities': () => {
        if (!selected) throw new AdminApiError('MODEL_NOT_LOADED', 'No audio model.')
        return capabilities
      },
    },
    { services: [service], setups: [download] }
  )
  const view = render(<AudioStudio workspace={workspace} onCatalog={vi.fn()} />)
  await userEvent.type(await screen.findByRole('textbox', { name: 'Describe the sound' }), 'A soft click')
  const stopped = { ...workspace, snapshot: { ...workspace.snapshot!, captured_at: 2, services: [] } }
  view.rerender(<AudioStudio workspace={stopped} onCatalog={vi.fn()} />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled())
  selected = false
  const unloaded = { ...stopped, snapshot: { ...stopped.snapshot, captured_at: 3 } }
  view.rerender(<AudioStudio workspace={unloaded} onCatalog={vi.fn()} />)
  expect(await screen.findByText('Choose a downloaded model to generate audio.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Text', exact: true })).toHaveValue(''))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

it('does not offer the previous model voices while another model capabilities are pending', async () => {
  let reply!: (value: unknown) => void
  const { workspace } = workspaceFixture(
    {
      'audio.capabilities': () =>
        new Promise((resolve) => {
          reply = resolve
        }),
    },
    { services: [service] }
  )
  const view = renderHook(({ workspace: w }) => useAudioSelection(w), { initialProps: { workspace } })
  await act(async () => {
    reply({ ...capabilities, voices: ['first-voice'] })
  })
  expect(view.result.current.voices).toEqual(['first-voice'])
  const next = {
    ...workspace,
    snapshot: {
      ...workspace.snapshot!,
      services: [
        {
          ...service,
          model: 'second:q8',
          details: {
            model: {
              state: 'loaded',
              loaded: { ...model, modelId: 'second:q8', displayName: 'Second model' },
            },
          },
        },
      ],
    },
  }
  view.rerender({ workspace: next })
  expect(view.result.current.model).toBe('second:q8')
  expect(view.result.current.voices).toEqual([])
  await act(async () => {
    reply({ ...capabilities, modelId: 'second:q8', voices: ['second-voice'] })
  })
  expect(view.result.current.voices).toEqual(['second-voice'])
})
