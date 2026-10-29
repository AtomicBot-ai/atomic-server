import { afterEach, expect, it, vi } from 'vitest'
import { tmpDataFolder } from '../../../../test/helpers/tmp-data-folder.js'
import { ChatHistory } from '../../../terminal-data/index.js'
import type { ActionContext } from '../actions.js'
import { activate } from '../actions.js'
import type { WorkspaceController } from '../controller.js'
import { createWorkspace } from '../state.js'
import type { WorkspaceState } from '../state.js'
import { failedTurn } from '../chat/failed-turn.js'
import { markSynced } from '../chat/live-conversation.js'
import { dataAction, persistConversation } from './data-actions.js'

const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))
async function rejectedTurn(localReply = false) {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const history = new ChatHistory(tmp.paths.atcDir)
  const chat = history.create('', 'm', '')
  chat.messages = [
    { role: 'user', content: 'Before' },
    { role: 'assistant', content: 'Before answer' },
  ]
  await history.save(chat, 0)
  let sent: WorkspaceState = {
    ...createWorkspace('chat'),
    setupComplete: true,
    endpointFollowsServer: true,
    model: 'm',
    conversation: chat,
    messages: chat.messages,
    draft: 'Keep my draft',
    cursor: 13,
    documents: [{ name: 'notes.txt', text: 'Keep my attachment' }],
  }
  let state = sent
  const ctx: ActionContext = {
    get: () => state,
    update: (fn) => {
      state = fn(state)
    },
    send: vi.fn(),
    cancel: vi.fn(),
    copy: vi.fn(),
    controller: {
      history,
      localEndpoint: async () => 'http://127.0.0.1:1337/v1',
    } as unknown as WorkspaceController,
  }
  markSynced(ctx.controller, chat)
  if (localReply) {
    ctx.update((s) => ({
      ...s,
      messages: [...s.messages, { role: 'assistant', content: 'Previously saved here' }],
    }))
    await persistConversation(ctx)
    sent = ctx.get()
  }
  const newer = {
    ...sent.conversation!,
    messages: [...sent.messages, { role: 'assistant' as const, content: 'From another client' }],
  }
  await history.save(newer, sent.conversation?.revision ?? 0)
  const optimistic = {
    ...sent,
    generating: true,
    draft: '',
    cursor: 0,
    documents: [],
    messages: [
      ...sent.messages,
      { role: 'user' as const, content: sent.draft },
      { role: 'assistant' as const, content: '' },
    ],
  }
  state = { ...optimistic, ...failedTurn(optimistic, sent, 'This conversation changed in another client.') }
  return { ctx, history, newer, sent }
}

it.each([false, true])(
  'can immediately reopen a refused stale turn (previous local save=%s)',
  async (localReply) => {
    const { ctx, history, newer, sent } = await rejectedTurn(localReply)
    await expect(dataAction(`history:${newer.id}`, ctx)).resolves.toBe(true)
    expect(ctx.get()).toMatchObject({
      conversation: newer,
      messages: newer.messages,
      draft: sent.draft,
      cursor: sent.cursor,
      documents: sent.documents,
    })
    expect(await history.load(newer.id)).toEqual(newer)
  }
)

it.each([false, true])(
  'allows New chat and normal Quit after a stale refusal (previous local save=%s)',
  async (localReply) => {
    const { ctx, history, newer } = await rejectedTurn(localReply)
    await expect(persistConversation(ctx)).resolves.toBeUndefined()
    await expect(activate('new', ctx)).resolves.toBeUndefined()
    expect(ctx.get()).toMatchObject({ conversation: null, messages: [], draft: '' })
    expect(await history.load(newer.id)).toEqual(newer)
  }
)

it('still refuses a genuinely unsaved transcript instead of overwriting a newer revision', async () => {
  const { ctx, history, newer } = await rejectedTurn()
  ctx.update((s) => ({
    ...s,
    messages: [...s.messages, { role: 'assistant', content: 'Keep this partial reply' }],
  }))
  await expect(persistConversation(ctx)).rejects.toThrow('changed in another client')
  expect(await history.load(newer.id)).toEqual(newer)
  expect(ctx.get().messages.at(-1)?.content).toBe('Keep this partial reply')
})
