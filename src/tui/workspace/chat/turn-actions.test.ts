import { afterEach, expect, it, vi } from 'vitest'
import { hostedWorkspace } from '../../../../test/helpers/hosted-workspace.js'
import { fakeCoreLink } from '../../../../test/helpers/fake-core-link.js'
import { tmpDataFolder } from '../../../../test/helpers/tmp-data-folder.js'
import { resolveConfig } from '../../../config/index.js'
import { ChatHistory } from '../../../terminal-data/index.js'
import { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import { dataAction, persistConversation } from '../server/data-actions.js'
import { markSynced } from './live-conversation.js'
import { turnActions } from './turn-actions.js'

const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
  vi.restoreAllMocks()
})
async function fixture(existing: boolean, remote = false) {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const link = fakeCoreLink()
  link.snapshotValue.server.running = true
  link.snapshotValue.sessions = [
    { provider: 'llamacpp-upstream', model_id: 'm', state: 'ready', port: 0 },
  ] as never
  const requests: Record<string, unknown>[] = []
  let first = true
  const request: typeof fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    const streaming = first
    first = false
    return new Response(
      new ReadableStream<Uint8Array>({
        start(c) {
          const text = streaming ? 'Partial answer' : 'Follow-up answer'
          c.enqueue(
            new TextEncoder().encode(
              `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`
            )
          )
          if (streaming)
            init?.signal?.addEventListener(
              'abort',
              () => c.error(new DOMException('Aborted', 'AbortError')),
              { once: true }
            )
          else {
            c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
            c.close()
          }
        },
      })
    )
  }
  const controller = new WorkspaceController(
    {
      request: hostedWorkspace(tmp.paths, link, request),
      apiKey: 'test-key',
      chatKey: '',
      base: {
        paths: tmp.paths,
        attach: async () => link,
        loadConfig: async () => resolveConfig({ env: {} }),
        runDoctor: async () => [],
        pendingHostSteps: async () => [],
        loginUrl: async () => '',
        openUrl: async () => {},
        now: () => new Date(),
      },
    },
    () => {},
    () => {},
    () => {}
  )
  cleanup.push(() => controller.dispose())
  await controller.keys.initialize('test-key')
  const endpoint = remote ? 'https://remote.test/v1' : ''
  const conversation = controller.history.create(endpoint, 'm', '')
  conversation.messages = [
    { role: 'user', content: 'Before' },
    { role: 'assistant', content: 'Before answer' },
  ]
  if (existing) {
    await controller.history.save(conversation, 0)
    markSynced(controller, conversation)
  }
  const latest = {
    current: {
      ...createWorkspace('chat'),
      ready: true,
      setupComplete: true,
      firstRun: null,
      endpointFollowsServer: !remote,
      endpoint,
      model: 'm',
      draft: 'Long question',
      conversation: existing ? conversation : null,
      messages: existing ? conversation.messages : [],
      workspace: await controller.runtime.snapshot(),
    } as WorkspaceState,
  }
  const update = (fn: (s: WorkspaceState) => WorkspaceState) => {
    latest.current = fn(latest.current)
  }
  const actions = turnActions(latest, { current: controller }, { current: 0 }, update, undefined)
  return { latest, controller, actions, update, requests, get: () => latest.current }
}

it.each([false, true])('stops, saves and continues a single conversation (existing=%s)', async (existing) => {
  const t = await fixture(existing)
  const save = ChatHistory.prototype.save
  let release!: () => void
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let savingStopped = false
  vi.spyOn(ChatHistory.prototype, 'save').mockImplementation(async function (
    this: ChatHistory,
    chat,
    revision
  ) {
    if (chat.interrupted && chat.messages.at(-1)?.content === 'Partial answer') {
      savingStopped = true
      await held
    }
    return save.call(this, chat, revision)
  })
  try {
    t.actions.send()
    await vi.waitFor(() => expect(t.get().messages.at(-1)?.content).toBe('Partial answer'))
    t.actions.cancel()
    await vi.waitFor(() => expect(savingStopped).toBe(true))
    expect(t.get()).toMatchObject({ generating: true, stopping: true })
    t.update((s) => ({ ...s, draft: 'Next question' }))
    t.actions.send()
    await persistConversation(t)
    expect(t.requests).toHaveLength(1)
    expect(await t.controller.history.list()).toHaveLength(1)
  } finally {
    release()
  }
  await vi.waitFor(() =>
    expect(t.get()).toMatchObject({ generating: false, stopping: false, message: 'Response stopped.' })
  )
  const saved = await t.controller.history.load(t.get().conversation!.id)
  expect(t.get().conversation).toEqual(saved)
  expect(saved?.interrupted).toBe(true)
  expect(saved?.endpoint).toBe('')
  expect(saved?.messages.at(-1)?.content).toBe('Partial answer')
  expect(t.get().draft).toBe('Next question')
  await persistConversation(t)
  expect(await t.controller.history.load(saved!.id)).toEqual(saved)
  expect(await t.controller.history.list()).toHaveLength(1)
  await dataAction(`history:${saved!.id}`, { ...t, ...t.actions, copy: vi.fn() })
  expect(t.get().conversation).toEqual(saved)
  const autosave = persistConversation(t)
  t.actions.send()
  await autosave
  await vi.waitFor(() => expect(t.get().messages.at(-1)?.content).toBe('Follow-up answer'))
  await vi.waitFor(() => expect(t.get().generating).toBe(false))
  expect(t.get().conversation?.id).toBe(saved?.id)
  expect(t.get().conversation?.revision).toBeGreaterThan(saved!.revision!)
  expect(t.get().message).not.toMatch(/changed|could not be saved/i)
  expect(await t.controller.history.list()).toHaveLength(1)
})

it('keeps a new chat intact when the cancelled old turn finishes later', async () => {
  const t = await fixture(true)
  t.actions.send()
  await vi.waitFor(() => expect(t.get().messages.at(-1)?.content).toBe('Partial answer'))
  const old = t.get().conversation!.id
  t.actions.cancel(true)
  t.update((s) => ({ ...s, conversation: null, messages: [], draft: 'New draft' }))
  await vi.waitFor(async () =>
    expect((await t.controller.history.load(old))?.messages.at(-1)?.content).toBe('Partial answer')
  )
  // Let the terminal receive the final progress response too.
  await new Promise((resolve) => setTimeout(resolve, 200))
  expect(t.get()).toMatchObject({ conversation: null, messages: [], draft: 'New draft', generating: false })
})

it('still preserves an interrupted response from a remote endpoint', async () => {
  const t = await fixture(false, true)
  t.actions.send()
  await vi.waitFor(() => expect(t.get().messages.at(-1)?.content).toBe('Partial answer'))
  t.actions.cancel()
  await vi.waitFor(() => expect(t.get()).toMatchObject({ generating: false, message: 'Response stopped.' }))
  await persistConversation(t)
  expect(await t.controller.history.list()).toHaveLength(1)
  expect((await t.controller.history.load(t.get().conversation!.id))?.interrupted).toBe(true)
  t.update((s) => ({ ...s, draft: 'Next question' }))
  t.actions.send()
  await vi.waitFor(() => expect(t.get().generating).toBe(false))
  await persistConversation(t)
  expect((await t.controller.history.load(t.get().conversation!.id))?.interrupted).toBe(false)
})
