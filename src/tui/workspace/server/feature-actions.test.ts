import { expect, it, vi } from 'vitest'
import type { Key } from 'ink'
import { createWorkspace } from '../state.js'
import { featureAction, featureInput } from './feature-actions.js'
import { featureData, featureDraft, featureFields, editorValue } from './feature-model.js'
import { workspaceFrame } from '../frame.js'
import type { ActionContext } from '../actions.js'
it('opens and saves a real assistant form without a generic operation screen', async () => {
  let state = { ...createWorkspace('access'), settingsGroup: 'assistants', setupComplete: true }
  const execute = vi.fn(async () => ({ assistants: [] })),
    ctx = {
      get: () => state,
      update: (fn: (s: typeof state) => typeof state) => {
        state = fn(state)
      },
      controller: { runtime: { execute } },
    } as unknown as ActionContext
  await featureAction('feature-add', ctx)
  expect(state.overlay).toBe('feature-editor')
  state = {
    ...state,
    featureEditor: featureDraft('assistants', {
      name: 'Reviewer',
      instructions: 'Review code',
      parameters: { temperature: 0.2 },
    }),
  }
  await featureAction('feature-save', ctx)
  expect(execute).toHaveBeenCalledWith('assistants.save', {
    value: { name: 'Reviewer', instructions: 'Review code', parameters: { temperature: 0.2 } },
  })
  expect(state.overlay).toBeNull()
})
it('tabs through every field even when the terminal displays only part of a form', () => {
  let state = {
    ...createWorkspace('access'),
    overlay: 'feature-editor' as const,
    featureEditor: featureDraft('attachments', {}),
    focus: 'feature-field:enabled',
  }
  const visited = []
  for (let i = 0; i < featureFields(state.featureEditor).length + 2; i++) {
    visited.push(state.focus)
    state = { ...state, ...featureInput('', { tab: true } as Key, state)?.patch } as typeof state
  }
  expect(visited).toContain('feature-field:max_image_size_px')
  expect(visited).toContain('feature-save')
  const frame = workspaceFrame(state, 90, 25, 0)
  expect(frame.popover).toBeDefined()
  expect(editorValue(featureDraft('attachments', { enabled: false, retrieval_limit: 4 }))).toMatchObject({
    enabled: false,
    retrieval_limit: 4,
  })
})
it('opens catalog secret fields, masks entered keys and validates JSON before saving', async () => {
  let state = { ...createWorkspace('access'), settingsGroup: 'connectors', setupComplete: true }
  const execute = vi.fn(async () => ({})),
    ctx = {
      get: () => state,
      update: (fn: (s: typeof state) => typeof state) => {
        state = fn(state)
      },
      controller: { runtime: { execute } },
    } as unknown as ActionContext
  await featureAction('feature-connector-setup:firecrawl', ctx)
  expect(state.featureEditor?.kind).toBe('connector-secret')
  state = {
    ...state,
    featureEditor: {
      ...state.featureEditor!,
      value: { ...state.featureEditor!.value, secret: 'secret-not-visible' },
    },
  }
  const frame = workspaceFrame(state, 120, 40, 0)
  expect(JSON.stringify(frame)).not.toContain('secret-not-visible')
  await featureAction('feature-connector-json', ctx)
  state = { ...state, featureEditor: { ...state.featureEditor!, value: { content: '{"mcpServers":[]}' } } }
  await expect(featureAction('feature-save', ctx)).rejects.toThrow('mcpServers must be an object')
  expect(execute).not.toHaveBeenCalledWith('connectors.import', expect.anything())
  expect(state.overlay).toBe('feature-editor')
})

it('offers a client ID field after OAuth registration fails and retries the same connector', async () => {
  vi.useFakeTimers()
  try {
    let state = { ...createWorkspace('access'), settingsGroup: 'connectors', setupComplete: true }
    const config = {
      id: 'linear',
      name: 'Linear',
      type: 'http' as const,
      url: 'https://mcp.linear.app/mcp',
      enabled: true,
    }
    state = {
      ...state,
      workspace: { features: { ...featureData(state), connectors: [config] } } as NonNullable<
        typeof state.workspace
      >,
    }
    const execute = vi.fn(async (name: string, input?: Record<string, unknown>) => {
        if (name === 'connectors.oauth.start') {
          if (!input?.['client_id']) throw new Error('A registered OAuth client ID is required.')
          return { url: 'https://example.com/sign-in' }
        }
        return {}
      }),
      run = vi.fn(async () => undefined),
      ctx = {
        get: () => state,
        update: (fn: (s: typeof state) => typeof state) => {
          state = fn(state)
        },
        controller: { runtime: { execute }, run },
      } as unknown as ActionContext
    await featureAction('feature-connector-signin:linear', ctx)
    expect(state.featureEditor?.kind).toBe('connector-oauth-client')
    expect(state.focus).toBe('feature-field:client_id')
    state = { ...state, ...featureInput('registered-client', {} as Key, state)?.patch }
    expect(workspaceFrame(state, 120, 40, 0).targets.some((target) => target.id === 'feature-save')).toBe(
      true
    )
    await featureAction('feature-save', ctx)
    expect(execute).toHaveBeenCalledWith('connectors.oauth.start', {
      id: 'linear',
      client_id: 'registered-client',
    })
    expect(state.featureEditor?.kind).toBe('connector-oauth')
    expect(run).toHaveBeenCalledWith({ name: 'open-url', url: 'https://example.com/sign-in' })
    expect(execute).not.toHaveBeenCalledWith('connectors.check', expect.anything())
  } finally {
    vi.clearAllTimers()
    vi.useRealTimers()
  }
})
