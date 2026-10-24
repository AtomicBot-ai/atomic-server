import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { Media } from './Media'

const capabilities = {
  workflows: ['create', 'edit'],
  supportsNegativePrompt: true,
  maxBatch: 4,
  defaults: { width: 512, height: 512, steps: 20, cfgScale: 7 },
}
function fixture(
  operations = {},
  services = [
    {
      id: 'image',
      kind: 'image-video',
      model: 'image-model',
      provider: 'sdcpp-server',
      state: 'ready',
      details: {},
    },
  ]
) {
  return workspaceFixture(
    {
      'media.capabilities': capabilities,
      'media.video.capabilities': capabilities,
      'media.image.gallery': [],
      'media.video.gallery': [],
      ...operations,
    },
    { services }
  )
}
it('uses the desktop studio controls, selectable gallery, recipe and keyboard-dismissed preview', async () => {
  const { workspace } = fixture({
    'media.image.gallery': [
      { id: 'first', recipe: { prompt: 'First picture', width: 768 } },
      { id: 'second', recipe: { prompt: 'Second picture' } },
    ],
  })
  render(<Media workspace={workspace} task="image" openCommand={vi.fn()} onCatalog={vi.fn()} />)
  expect(await screen.findByRole('combobox', { name: 'Mode' })).toHaveValue('create')
  expect(screen.getByRole('complementary', { name: 'Image controls' })).toContainElement(
    screen.getByRole('button', { name: 'Generate' })
  )
  await userEvent.click(await screen.findByRole('button', { name: 'View Second picture' }))
  expect(screen.getByRole('button', { name: 'Open image preview' })).toContainElement(
    screen.getAllByAltText('Second picture')[0]
  )
  await userEvent.click(screen.getByText('Recipe', { selector: 'summary' }))
  await userEvent.click(screen.getByRole('button', { name: 'Restore settings' }))
  expect(screen.getByLabelText('Prompt')).toHaveValue('Second picture')
  const trigger = screen.getByRole('button', { name: 'Full-screen preview' })
  await userEvent.click(trigger)
  expect(screen.getByRole('dialog', { name: 'Image preview' })).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})
it('keeps Generate and Stop in one slot, freezes request controls and confirms cancellation in the app', async () => {
  let cancelled = false
  const { workspace, execute } = fixture({
    'media.image.create': { jobId: 'job' },
    'media.image.job': () => ({
      id: 'job',
      state: cancelled ? 'cancelled' : 'generating',
      progress: { fraction: 0.42, step: 8, totalSteps: 20, etaSeconds: 28 },
    }),
    'media.image.cancel': () => {
      cancelled = true
      return {}
    },
  })
  render(<Media workspace={workspace} task="image" openCommand={vi.fn()} />)
  await waitFor(() => expect(screen.getByLabelText('Width')).toHaveValue(512))
  await userEvent.type(screen.getByLabelText('Prompt'), 'A geometric landscape')
  const slot = screen.getByRole('button', { name: 'Generate' }).parentElement
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  const stop = await screen.findByRole('button', { name: 'Stop', exact: true })
  expect(stop.parentElement).toBe(slot)
  expect(screen.getByLabelText('Prompt')).toBeDisabled()
  expect(screen.getByRole('progressbar', { name: 'Generation progress' })).toHaveAttribute('value', '0.42')
  await userEvent.click(stop)
  const dialog = screen.getByRole('dialog', { name: 'Stop generation?' })
  await userEvent.keyboard('{Escape}')
  expect(dialog).not.toBeInTheDocument()
  expect(execute).not.toHaveBeenCalledWith('media.image.cancel', expect.anything())
  await userEvent.click(stop)
  await userEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Stop generation', exact: true })
  )
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(execute).toHaveBeenCalledWith('media.image.cancel', { id: 'job' })
  expect(screen.getByLabelText('Prompt')).toHaveValue('A geometric landscape')
  expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled()
})
it('retains the prompt on rejected generation and refreshes the gallery for an immediately completed retry', async () => {
  let attempts = 0,
    completed = false
  const { workspace } = fixture({
    'media.image.create': () => {
      if (!attempts++) throw Error('Engine out of memory')
      completed = true
      return { jobId: 'done' }
    },
    'media.image.job': { id: 'done', state: 'complete', progress: { fraction: 1 } },
    'media.image.gallery': () => (completed ? [{ id: 'result', recipe: { prompt: 'Keep my prompt' } }] : []),
  })
  render(<Media workspace={workspace} task="image" openCommand={vi.fn()} />)
  await waitFor(() => expect(screen.getByLabelText('Width')).toHaveValue(512))
  await userEvent.type(screen.getByLabelText('Prompt'), 'Keep my prompt')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Engine out of memory')
  expect(screen.getByLabelText('Prompt')).toHaveValue('Keep my prompt')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(await screen.findByRole('button', { name: 'View Keep my prompt' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('loads only a downloaded model of the current media type and locks the picker while loading', async () => {
  let finish!: () => void
  const { workspace, execute } = fixture(
    {
      'artifacts.list': [
        {
          id: 'image',
          stage: 'ready',
          plan: { category: 'image', name: 'Image model', model_id: 'image-id' },
        },
        {
          id: 'video',
          stage: 'ready',
          plan: { category: 'video', name: 'Video model', model_id: 'video-id' },
        },
        { id: 'pending', stage: 'downloading', plan: { category: 'image', name: 'Pending image' } },
      ],
      'artifacts.load': () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    },
    []
  )
  const onCatalog = vi.fn()
  render(<Media workspace={workspace} task="image" openCommand={vi.fn()} onCatalog={onCatalog} />)
  await userEvent.click(screen.getAllByRole('button', { name: 'Choose a model' })[0])
  const dialog = screen.getByRole('dialog', { name: 'Choose a model' })
  await userEvent.click(await within(dialog).findByRole('button', { name: 'Load model' }))
  expect(within(dialog).queryByText('Video model')).not.toBeInTheDocument()
  expect(within(dialog).queryByText('Pending image')).not.toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  expect(dialog).toBeInTheDocument()
  await act(async () => finish())
  await waitFor(() => expect(dialog).not.toBeInTheDocument())
  expect(execute).toHaveBeenCalledWith('artifacts.load', { id: 'image' })
  await userEvent.click(screen.getAllByRole('button', { name: 'Choose a model' })[0])
  await userEvent.click(await screen.findByRole('button', { name: 'Browse models' }))
  expect(onCatalog).toHaveBeenCalledOnce()
})
it('does not use an image model for video and enables generation only after a video model loads', async () => {
  const imageService = {
    id: 'image-video',
    kind: 'image-video',
    model: 'image-model',
    provider: 'sdcpp-server',
    state: 'loaded',
    details: { model: { loaded: { modelId: 'image-model', modality: 'image' } } },
  }
  const { workspace, execute } = fixture({}, [imageService])
  const view = render(<Media workspace={workspace} task="video" openCommand={vi.fn()} />)
  await userEvent.type(screen.getByLabelText('Prompt'), 'A moving landscape')
  expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'image-model' })).not.toBeInTheDocument()
  expect(execute).not.toHaveBeenCalledWith('media.video.capabilities')
  view.rerender(
    <Media
      workspace={{
        ...workspace,
        snapshot: {
          ...workspace.snapshot!,
          services: [
            {
              ...imageService,
              model: 'video-model',
              details: { model: { loaded: { modelId: 'video-model', modality: 'video' } } },
            },
          ],
        },
      }}
      task="video"
      openCommand={vi.fn()}
    />
  )
  await waitFor(() => expect(execute).toHaveBeenCalledWith('media.video.capabilities'))
  await userEvent.type(screen.getByLabelText('Prompt'), 'A moving landscape')
  expect(screen.getByRole('button', { name: 'video-model' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled()
})
it('uses prompt guidance in an empty gallery when a compatible model is already loaded', async () => {
  const { workspace } = fixture()
  render(<Media workspace={workspace} task="image" openCommand={vi.fn()} />)
  expect(await screen.findByText('Enter a prompt and select Generate.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Choose a model' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'image-model' })).toBeInTheDocument()
})
