import { describe, expect, it, vi } from 'vitest'
import { AtcError } from '../../errors/index.js'
import { chatOperation } from './chat-operations.js'
import { NOT_CORE } from '../not-core.js'

function parts() {
  const history = {
    list: vi.fn(async () => ['c1']),
    load: vi.fn(async (id: string) => ({ id })),
    remove: vi.fn(async () => undefined),
    save: vi.fn(async () => undefined),
  }
  const chats = {
    running: vi.fn(() => [] as Array<{ id: string; conversation_id: string; state: 'generating' }>),
    start: vi.fn(async () => ({ id: 'job' })),
    get: vi.fn(async (id: string) => ({ id, state: 'generating' })),
    cancel: vi.fn(async (id: string) => ({ id, state: 'cancelled' })),
  }
  return {
    history,
    chats,
    parts: { options: {}, keys: {}, history, chats, request: fetch, enrich: vi.fn() } as never,
  }
}

describe('chat operations', () => {
  it.each([
    ['history.list', {}, ['c1']],
    ['history.load', { id: 'c1' }, { id: 'c1' }],
    ['history.remove', { id: 'c1' }, { removed: true }],
    ['chat.start', { request: {} }, { id: 'job' }],
    ['chat.progress', { id: 'job' }, { id: 'job', state: 'generating' }],
    ['chat.cancel', { id: 'job' }, { id: 'job', state: 'cancelled' }],
  ])('routes %s to its owner', async (operation, input, answer) => {
    expect(await chatOperation(parts().parts, operation, input)).toEqual(answer)
  })

  it('saves a chat only with an id and messages', async () => {
    const { history, parts: p } = parts()
    await expect(chatOperation(p, 'history.save', { chat: { messages: [] } })).rejects.toThrow(
      'A chat needs id and messages.'
    )
    expect(await chatOperation(p, 'history.save', { chat: { id: 'c1', messages: [] } })).toEqual({
      saved: true,
      chat: { id: 'c1', messages: [] },
    })
    expect(history.save).toHaveBeenCalledWith({ id: 'c1', messages: [] }, 0)
  })

  it('leaves any other operation to the next owner', async () => {
    expect(await chatOperation(parts().parts, 'keys.list', {})).toBe(NOT_CORE)
  })
})

it('saves messages with the expected revision while another client is generating', async () => {
  const { chats, history, parts: p } = parts()
  chats.running.mockReturnValue([{ id: 'job', conversation_id: 'c1', state: 'generating' }])
  const chat = { id: 'c1', revision: 3, messages: [{ role: 'user', content: 'replacement' }] }
  await expect(chatOperation(p, 'history.save', { chat, expected_revision: 4 })).resolves.toEqual({
    saved: true,
    chat,
  })
  expect(history.save).toHaveBeenCalledWith(chat, 4)
})

it('uses the loaded revision when an expected revision is not supplied', async () => {
  const { history, parts: p } = parts()
  const chat = { id: 'c1', revision: 3, messages: [] }
  await chatOperation(p, 'history.save', { chat })
  expect(history.save).toHaveBeenCalledWith(chat, 3)
})

it('passes a stale revision conflict back to the client', async () => {
  const { history, parts: p } = parts()
  const conflict = new AtcError('ATC_USAGE', 'This conversation changed in another client.')
  history.save.mockRejectedValueOnce(conflict)
  await expect(
    chatOperation(p, 'history.save', {
      chat: { id: 'c1', revision: 2, messages: [] },
    })
  ).rejects.toBe(conflict)
})

it('allows a metadata-only edit while a response is active', async () => {
  const { chats, history, parts: p } = parts()
  const messages = [{ role: 'user', content: 'hi' }]
  history.load.mockResolvedValue({ id: 'c1', messages } as never)
  chats.running.mockReturnValue([{ id: 'job', conversation_id: 'c1', state: 'generating' }])
  await expect(
    chatOperation(p, 'history.save', { chat: { id: 'c1', title: 'Renamed', messages } })
  ).resolves.toMatchObject({ saved: true })
  expect(history.save).toHaveBeenCalledWith({ id: 'c1', title: 'Renamed', messages }, 0)
})
