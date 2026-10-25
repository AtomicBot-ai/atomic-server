import { describe, expect, it, vi } from 'vitest'
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
    })
    expect(history.save).toHaveBeenCalledWith({ id: 'c1', messages: [] })
  })

  it('leaves any other operation to the next owner', async () => {
    expect(await chatOperation(parts().parts, 'keys.list', {})).toBe(NOT_CORE)
  })
})
