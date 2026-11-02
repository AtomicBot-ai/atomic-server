import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { workspaceFixture } from '@/test/workspace-fixture'
import { AudioStudio } from './AudioStudio'

const MODEL = 'stable-audio-3-small-sfx:q8_0'
const stable = {
  id: 'job',
  stage: 'ready',
  category: 'audio',
  name: 'Stable Audio 3 Small SFX',
  plan: {
    category: 'audio',
    model_id: MODEL,
    name: 'Stable Audio 3 Small SFX',
    audio: {
      mode: 'effects',
      attribution: 'Powered by Stability AI',
      controls: ['durationSec', 'seed'],
      defaults: { durationSec: 5, seed: 42 },
      ranges: { durationSec: [1, 30] },
    },
  },
}
const service = (mode = 'effects', model = MODEL, details = {}) => ({
  id: 'audio',
  kind: 'audio' as const,
  provider: 'audio-cpp',
  model,
  state: 'loaded',
  details: {
    model: { state: 'loaded', loaded: { modelId: model, mode, displayName: 'Stable Audio 3 Small SFX' } },
    ...details,
  },
})
const clip = {
  id: 'clip1',
  audioMs: 2500,
  recipe: { text: 'A door creaks', model: { displayName: 'Stable Audio 3 Small SFX' } },
}
function studio(operations = {}, over = {}) {
  const fixture = workspaceFixture(
    { 'audio.gallery': { items: [] }, 'audio.capabilities': { voices: [] }, ...operations },
    { services: [service()], setups: [stable], ...over }
  )
  render(<AudioStudio workspace={fixture.workspace} onCatalog={vi.fn()} />)
  return fixture
}

it('asks for a model before anything can be generated', async () => {
  studio({}, { services: [], setups: [] })
  expect(await screen.findByText('Choose a downloaded model to generate audio.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
  expect(screen.getByRole('complementary', { name: 'Audio controls' })).toBeInTheDocument()
})

it('draws the form of the loaded model from the catalog, with its notice beside the model', async () => {
  studio()
  expect(await screen.findByText('Powered by Stability AI')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Stable Audio 3 Small SFX' })).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Describe the sound' })).toBeInTheDocument()
  const length = screen.getByRole('spinbutton', { name: 'Length (seconds)' })
  expect(length).toHaveValue(5)
  expect(length).toHaveAttribute('min', '1')
  expect(length).toHaveAttribute('max', '30')
  expect(screen.getByRole('spinbutton', { name: 'Seed' })).toHaveValue(42)
  expect(screen.queryByRole('combobox', { name: 'Voice' })).not.toBeInTheDocument()
})

it("starts a job in the loaded model's mode with the form's values, and follows it by phase", async () => {
  const { execute } = studio({
    'audio.generate': { id: 'j1', state: 'queued', progress: null },
    'audio.job': {
      job: { id: 'j1', state: 'generating', progress: { phase: 'generating', elapsedMs: 3000 } },
    },
  })
  await userEvent.type(await screen.findByRole('textbox', { name: 'Describe the sound' }), 'A door creaks')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(execute).toHaveBeenCalledWith('audio.generate', {
    mode: 'effects',
    request: { text: 'A door creaks', durationSec: 5, seed: 42 },
  })
  expect(await screen.findByRole('status')).toHaveTextContent('Waiting to start')
  expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
})

it('holds a length typed past the catalog range to that range', async () => {
  const { execute } = studio({ 'audio.generate': { id: 'j1', state: 'completed' } })
  const length = await screen.findByRole('spinbutton', { name: 'Length (seconds)' })
  await userEvent.clear(length)
  await userEvent.type(length, '500')
  await userEvent.type(screen.getByRole('textbox', { name: 'Describe the sound' }), 'A door')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(execute).toHaveBeenCalledWith('audio.generate', {
    mode: 'effects',
    request: { text: 'A door', durationSec: 30, seed: 42 },
  })
})

it('adopts a job already running', async () => {
  const active = { id: 'j9', state: 'generating', progress: { phase: 'generating', elapsedMs: 7000 } }
  studio({}, { services: [service('effects', MODEL, { activeJob: active })] })
  expect(await screen.findByRole('status')).toHaveTextContent('Generating · 7 s')
})

it('moves on from a job when it finishes, and shows the clip', async () => {
  const gallery = vi.fn(async () => ({ items: [] as unknown[] }))
  studio({
    'audio.gallery': gallery,
    'audio.generate': { id: 'j1', state: 'queued', progress: null },
    'audio.job': { job: { id: 'j1', state: 'completed', progress: null } },
  })
  await userEvent.type(await screen.findByRole('textbox', { name: 'Describe the sound' }), 'A door')
  gallery.mockResolvedValue({ items: [clip] })
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  const player = await screen.findByLabelText('A door creaks', {}, { timeout: 3000 })
  expect(player).toHaveAttribute('src', '/api/workspace/artifacts/audio/clip1')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled())
})

it('says why a job failed in the engine’s words', async () => {
  studio({
    'audio.generate': { id: 'j1', state: 'failed', error: { message: 'The model refused.' } },
  })
  await userEvent.type(await screen.findByRole('textbox', { name: 'Describe the sound' }), 'A door')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('The model refused.')
})

it('offers the voices the loaded model lists, and sends the one chosen', async () => {
  const speech = {
    ...stable,
    plan: {
      ...stable.plan,
      audio: { mode: 'speech', attribution: null, controls: ['voice'], defaults: {}, ranges: {} },
    },
  }
  const { execute } = studio(
    {
      'audio.capabilities': { voices: ['serena', 'vivian'] },
      'audio.generate': { id: 'j1', state: 'completed' },
    },
    { services: [service('speech')], setups: [speech] }
  )
  await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Voice' }), 'serena')
  await userEvent.type(screen.getByRole('textbox', { name: 'Text to say' }), 'Hello')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(execute).toHaveBeenCalledWith('audio.generate', {
    mode: 'speech',
    request: { voice: 'serena', text: 'Hello' },
  })
})

it('cancels a running job after asking', async () => {
  const active = { id: 'j9', state: 'generating', progress: { phase: 'generating', elapsedMs: 0 } }
  const { execute } = studio(
    { 'audio.job': { job: { id: 'j9', state: 'cancelled' } } },
    { services: [service('effects', MODEL, { activeJob: active })] }
  )
  await userEvent.click(await screen.findByRole('button', { name: 'Stop' }))
  await userEvent.click(screen.getByRole('button', { name: 'Stop generation' }))
  expect(execute).toHaveBeenCalledWith('audio.cancel', { id: 'j9' })
})

it('plays, saves and deletes clips from the gallery', async () => {
  const { execute } = studio({ 'audio.gallery': { items: [clip] } })
  expect(await screen.findByLabelText('A door creaks')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Save A door creaks' })).toHaveAttribute(
    'href',
    '/api/workspace/artifacts/audio/clip1'
  )
  expect(screen.getByText(/2\.5 s/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Delete' }))
  await userEvent.click(screen.getByRole('button', { name: 'Delete clip' }))
  await waitFor(() => expect(execute).toHaveBeenCalledWith('audio.delete', { id: 'clip1' }))
})

it('loads a downloaded model from the picker, with its notice', async () => {
  const { execute } = studio({ 'artifacts.list': [stable] }, { services: [] })
  const [trigger] = await screen.findAllByRole('button', { name: 'Choose a model' })
  await userEvent.click(trigger!)
  expect(await screen.findByText('Powered by Stability AI')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Load model' }))
  expect(execute).toHaveBeenCalledWith('artifacts.load', { id: 'job' })
})

it('shows a core request failure', async () => {
  const { execute } = workspaceFixture({})
  execute.mockRejectedValue(new Error('Audio service unavailable.'))
  const { workspace } = workspaceFixture({})
  render(<AudioStudio workspace={{ ...workspace, execute }} onCatalog={vi.fn()} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Audio service unavailable')
})
