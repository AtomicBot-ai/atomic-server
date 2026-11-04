import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { Media } from './Media'
import { AudioStudio } from './AudioStudio'
import { AdminApiError } from '@/services/admin-api'
import { useAudioStudio } from './useAudioStudio'

it('keeps a custom size outside the selected model range and explains the required correction inline', async () => {
  const { workspace, execute } = workspaceFixture({
    'media.image.gallery': [],
    'media.capabilities': {
      workflows: ['create'],
      maxDim: 512,
      defaults: { width: 512, height: 512, steps: 20 },
    },
  })
  const view = render(<Media workspace={workspace} task="image" openCommand={vi.fn()} />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Prompt' }), { target: { value: 'Keep my picture' } })
  fireEvent.change(screen.getByLabelText('Width'), { target: { value: '768' } })
  view.rerender(
    <Media
      workspace={{
        ...workspace,
        snapshot: {
          ...workspace.snapshot!,
          services: [
            {
              id: 'image',
              kind: 'image-video',
              state: 'loaded',
              provider: 'sdcpp-server',
              model: 'small-model',
              details: {},
            },
          ],
        },
      }}
      task="image"
      openCommand={vi.fn()}
    />
  )
  await waitFor(() => expect(screen.getByLabelText('Width')).toHaveAttribute('aria-invalid', 'true'))
  expect(screen.getByLabelText('Width')).toHaveValue(768)
  expect(screen.getByLabelText('Width')).toHaveAccessibleDescription(
    'Use a value from 64 to 512 for this model. Your value has been kept.'
  )
  expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Generate' })).toHaveAccessibleDescription(
    'Check the highlighted settings before generating.'
  )
  expect(execute).not.toHaveBeenCalledWith('media.image.create', expect.anything())
  fireEvent.change(screen.getByLabelText('Width'), { target: { value: '512' } })
  expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled()
  expect(screen.getByRole('textbox', { name: 'Prompt' })).toHaveValue('Keep my picture')
})

it.each(['image', 'video'])(
  'keeps edited %s fields while applying new defaults to untouched fields',
  async (task) => {
    let finish!: (value: unknown) => void
    const { workspace, execute } = workspaceFixture({
      [`media.${task}.gallery`]: [],
      [task === 'image' ? 'media.capabilities' : 'media.video.capabilities']: () =>
        new Promise((resolve) => {
          finish = resolve
        }),
      [`media.${task}.create`]: { jobId: 'job' },
      [`media.${task}.job`]: { id: 'job', state: 'complete' },
    })
    const props = { task, openCommand: vi.fn() }
    const view = render(<Media workspace={workspace} {...props} />)
    fireEvent.change(screen.getByLabelText('Prompt'), { target: { value: 'My first prompt' } })
    fireEvent.change(screen.getByLabelText('Width'), { target: { value: '768' } })
    view.rerender(
      <Media
        workspace={{
          ...workspace,
          snapshot: {
            ...workspace.snapshot!,
            services: [
              {
                id: 'media',
                kind: 'image-video',
                provider: 'sdcpp-server',
                state: 'loaded',
                model: 'first-model',
                details: { model: { loaded: { modelId: 'first-model', modality: task } } },
              },
            ],
          },
        }}
        {...props}
      />
    )
    // Edits made while the engine reports its capabilities must also survive.
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Steps' }), { target: { value: '12' } })
    await act(async () =>
      finish({ workflows: ['create'], defaults: { width: 1024, height: 640, steps: 30 } })
    )
    expect(screen.getByLabelText('Prompt')).toHaveValue('My first prompt')
    expect(screen.getByLabelText('Width')).toHaveValue(768)
    expect(screen.getByRole('spinbutton', { name: 'Steps' })).toHaveValue(12)
    expect(screen.getByLabelText('Height')).toHaveValue(640)
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() =>
      expect(execute).toHaveBeenCalledWith(`media.${task}.create`, {
        request: expect.objectContaining({
          prompt: 'My first prompt',
          width: 768,
          height: 640,
          steps: 12,
        }),
      })
    )
  }
)

it('keeps the audio text through the first model load and excludes controls from a previous model', async () => {
  let loaded = false
  const { workspace, execute } = workspaceFixture({
    'audio.gallery': [],
    'audio.capabilities': () => {
      if (!loaded) throw new AdminApiError('MODEL_NOT_LOADED', 'No model')
      return { modelId: 'audio-model', mode: 'effects', voices: [] }
    },
    'audio.generate': { id: 'job', state: 'complete' },
  })
  const view = render(<AudioStudio workspace={workspace} onCatalog={vi.fn()} />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Text', exact: true }), {
    target: { value: 'A quiet bell' },
  })
  loaded = true
  const next = {
    ...workspace,
    snapshot: {
      ...workspace.snapshot!,
      captured_at: 2,
      services: [
        {
          id: 'audio',
          kind: 'audio',
          provider: 'audio-cpp',
          state: 'loaded',
          model: 'audio-model',
          details: { model: { loaded: { modelId: 'audio-model', mode: 'effects' } } },
        },
      ],
      setups: [
        {
          id: 'download',
          stage: 'ready',
          plan: {
            model_id: 'audio-model',
            category: 'audio',
            audio: { mode: 'effects', controls: ['durationSec'], defaults: { durationSec: 5 }, ranges: {} },
          },
        },
      ],
    },
  }
  view.rerender(<AudioStudio workspace={next} onCatalog={vi.fn()} />)
  expect(await screen.findByRole('textbox', { name: 'Describe the sound' })).toHaveValue('A quiet bell')
  fireEvent.change(screen.getByLabelText('Length (seconds)'), { target: { value: '7' } })
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith('audio.generate', {
      mode: 'effects',
      request: { text: 'A quiet bell', durationSec: 7 },
    })
  )
  view.rerender(
    <AudioStudio workspace={{ ...next, snapshot: { ...next.snapshot, setups: [] } }} onCatalog={vi.fn()} />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }))
  await waitFor(() =>
    expect(execute).toHaveBeenCalledWith('audio.generate', {
      mode: 'effects',
      request: { text: 'A quiet bell' },
    })
  )
})

it('does not send a retained voice that the next audio model does not support', async () => {
  let voice = 'first-voice'
  const { workspace, execute } = workspaceFixture(
    {
      'audio.gallery': [],
      'audio.capabilities': () => ({ modelId: 'speech', mode: 'speech', voices: [voice] }),
      'audio.generate': { id: 'job', state: 'complete' },
    },
    {
      setups: [
        {
          id: 'speech',
          stage: 'ready',
          plan: {
            model_id: 'speech',
            audio: {
              mode: 'speech',
              controls: ['voice'],
              defaults: {},
              ranges: {},
            },
          },
        },
      ],
    }
  )
  const view = renderHook(({ w }) => useAudioStudio(w), { initialProps: { w: workspace } })
  await waitFor(() => expect(view.result.current.voices).toEqual(['first-voice']))
  act(() => {
    view.result.current.change('text', 'Keep my words')
    view.result.current.change('voice', voice)
  })
  await act(() => view.result.current.generate())
  expect(execute).toHaveBeenCalledWith('audio.generate', {
    mode: 'speech',
    request: { text: 'Keep my words', voice: 'first-voice' },
  })
  voice = 'second-voice'
  view.rerender({ w: { ...workspace, snapshot: { ...workspace.snapshot!, captured_at: 2 } } })
  await waitFor(() => expect(view.result.current.voices).toEqual(['second-voice']))
  await act(() => view.result.current.generate())
  expect(execute).toHaveBeenCalledWith('audio.generate', {
    mode: 'speech',
    request: { text: 'Keep my words' },
  })
})
