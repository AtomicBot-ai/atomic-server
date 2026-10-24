import { expect, it } from 'vitest'
import type { WorkspaceSnapshot } from '../../../contract/index.js'
import { workspaceFrame } from '../frame.js'
import { createWorkspace } from '../state.js'
import { chatReadiness, readinessPatch } from './readiness.js'
import { applyWorkspaceSnapshot } from '../shared-state.js'

const endpoint = 'http://127.0.0.1:1337/v1'
function ready(provider: string) {
  return {
    ...createWorkspace('chat'),
    draft: 'Keep this draft',
    model: 'selected-model',
    endpoint,
    workspace: {
      api: { running: true, endpoint },
      services: [
        {
          id: 'selected',
          provider,
          model: 'selected-model',
          kind: 'chat',
          state: 'ready',
          details: {},
        },
      ],
      setups: [],
      downloads: [],
      loads: [],
    } as unknown as WorkspaceSnapshot,
  }
}

it.each(['llamacpp-upstream', 'openai'])(
  'allows a ready %s model to send through the running API',
  (provider) => {
    const s = ready(provider)
    expect(chatReadiness(s)?.ready).toBe(true)
    expect(readinessPatch(s)).toBeNull()
    expect(workspaceFrame(s, 120, 36, 0).targets.some((t) => t.id === 'send')).toBe(true)
    s.workspace.api.running = false
    expect(readinessPatch(s)).toMatchObject({
      page: 'server',
      serverView: 'overview',
      message: 'Start the server to send a message.',
    })
    expect(workspaceFrame(s, 120, 36, 0).targets.some((t) => t.id === 'send')).toBe(true)
  }
)

it('keeps a pending selected model in place and preserves the draft until download finishes', () => {
  const s = ready('llamacpp-upstream')
  s.workspace.services = []
  s.workspace.setups = [
    { id: 'download', stage: 'downloading', plan: { model_id: s.model, total_download_bytes: 100 } },
  ]
  expect(readinessPatch(s)).toEqual({
    message: 'The model is downloading. Wait until it is ready.',
    downloadAttention: 1,
  })
  expect(workspaceFrame(s, 120, 36, 0).targets.some((t) => t.id === 'send')).toBe(true)
  expect(s.draft).toBe('Keep this draft')
})

it('does not apply local server readiness to a separately connected endpoint', () => {
  const s = ready('openai')
  s.endpoint = 'https://provider.example/v1'
  s.workspace.services = []
  s.workspace.api.running = false
  expect(chatReadiness(s)).toBeNull()
  expect(readinessPatch(s)).toBeNull()
  expect(workspaceFrame(s, 120, 36, 0).targets.some((t) => t.id === 'send')).toBe(true)
})

it('offers Send with no model and routes the blocked attempt to acquisition while retaining the draft', () => {
  const s = ready('llamacpp-upstream')
  s.model = ''
  s.workspace.services = []
  const blocked = readinessPatch(s)
  expect(blocked).toMatchObject({
    page: 'models',
    libraryView: 'catalog',
    message: 'Choose and download a model to continue.',
  })
  expect({ ...s, ...blocked }.draft).toBe('Keep this draft')
  const frame = workspaceFrame(s, 120, 36, 0)
  expect(frame.targets.some((t) => t.id === 'send')).toBe(true)
  expect(frame.targets.some((t) => t.id === 'chat-acquire')).toBe(false)
})

it('never treats an empty model as a routable remote request or an implicit ready local model', () => {
  const s = ready('openai')
  s.model = ''
  for (const url of [endpoint, 'http://127.0.0.1:1338/v1', 'https://provider.example/v1']) {
    s.endpoint = url
    expect(readinessPatch(s)).toMatchObject({ page: 'models', message: 'Choose a model to continue.' })
  }
})
it('checks local readiness across loopback aliases', () => {
  const s = ready('openai')
  s.endpoint = 'http://localhost:1337/v1/'
  s.workspace.api.running = false
  expect(readinessPatch(s)).toMatchObject({ page: 'server', message: 'Start the server to send a message.' })
})

it.each(['pending', 'failed'] as const)(
  'preserves %s selection intent even when a shared poll advertises that model as ready',
  (status) => {
    const s = ready('llamacpp-upstream')
    const result = applyWorkspaceSnapshot(
      {
        ...s,
        modelLoad: status === 'pending' ? { model: s.model, provider: 'llamacpp-upstream' } : null,
        loadError:
          status === 'failed'
            ? { model: s.model, provider: 'llamacpp-upstream', message: 'Memory limit' }
            : null,
      },
      { ...s.workspace, keys: [], setup: { complete: true, mode: 'manual', updated_at: 1 } },
      2
    )
    expect(result).toMatchObject({ model: s.model, draft: s.draft })
    expect(chatReadiness(result)).toMatchObject({ ready: false, waiting: status === 'pending' })
  }
)
