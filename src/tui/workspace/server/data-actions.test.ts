import { expect, it, vi } from 'vitest'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import type { ActionContext } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import type { Conversation } from '../../../terminal-data/index.js'
import type { WorkspaceSnapshot } from '../../../contract/index.js'
import { dataAction, persistConversation, saveDataEdit } from './data-actions.js'
import { savedConversationPatch } from '../chat/live-conversation.js'

const HERE = 'http://127.0.0.1:62732/v1'
function context(saved: Partial<Conversation>) {
  let state: WorkspaceState = {
    ...createWorkspace('chat'),
    setupComplete: true,
    endpoint: HERE,
    workspace: { api: { running: true, endpoint: HERE } } as unknown as WorkspaceSnapshot,
  }
  const chat: Conversation = {
    id: 'c1',
    title: 'Saved',
    endpoint: '',
    model: 'm',
    workingDirectory: '',
    createdAt: 1,
    updatedAt: 1,
    messages: [{ role: 'user', content: 'hi' }],
    interrupted: false,
    ...saved,
  }
  const save = vi.fn(async () => {})
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    controller: {
      history: { load: async () => chat, save, list: async () => [] },
      localEndpoint: async () => HERE,
    } as unknown as WorkspaceController,
    send: vi.fn(),
    copy: vi.fn(),
    cancel: vi.fn(),
  }
  return { ctx, save }
}

it.each([
  ['saved by the Web, with no address', '', HERE, true],
  ['saved at this server’s address', HERE, HERE, true],
  ['saved with a remote provider', 'https://openrouter.ai/api/v1', 'https://openrouter.ai/api/v1', false],
])('opens a conversation %s on the right endpoint', async (_, saved, endpoint, follows) => {
  const { ctx } = context({ endpoint: saved })
  await dataAction('history:c1', ctx)
  expect(ctx.get()).toMatchObject({ conversation: { id: 'c1' }, endpoint, endpointFollowsServer: follows })
})

it('saves a conversation on this server with no address, as the Web does, so a port change keeps it here', async () => {
  const { ctx, save } = context({})
  ctx.update((s) => ({
    ...s,
    conversation: { id: 'c1' } as Conversation,
    messages: [{ role: 'user', content: 'hi' }],
  }))
  await persistConversation(ctx)
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ endpoint: '' }))
  ctx.update((s) => ({ ...s, endpoint: 'https://openrouter.ai/api/v1', endpointFollowsServer: false }))
  await persistConversation(ctx)
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ endpoint: 'https://openrouter.ai/api/v1' }))
})

it('keeps taking another client’s turns after a rename here', async () => {
  const { ctx } = context({})
  await dataAction('history:c1', ctx)
  ctx.update((s) => ({ ...s, edit: 'rename-chat', editValue: 'Renamed here' }))
  await saveDataEdit(ctx)
  const before = ctx.get()
  expect(before.conversation?.title).toBe('Renamed here')
  const turn = [...before.messages, { role: 'assistant' as const, content: 'From the Web' }]
  const saved = { ...before.conversation!, messages: turn }
  expect(savedConversationPatch(ctx.controller, before, before, saved)).toMatchObject({ messages: turn })
})
