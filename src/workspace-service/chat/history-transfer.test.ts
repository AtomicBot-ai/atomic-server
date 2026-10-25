import { afterEach, describe, expect, it } from 'vitest'
import { ChatHistory } from '../../terminal-data/index.js'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { importConversations } from './history-transfer.js'

const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))
function history() {
  const folder = tmpDataFolder()
  cleanup.push(folder.cleanup)
  return new ChatHistory(folder.paths.atcDir)
}
const conversation = (over: Record<string, unknown> = {}) => ({
  title: 'Earlier chat',
  model: 'qwen',
  messages: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi' },
  ],
  ...over,
})

describe('importing conversations', () => {
  it('saves each conversation under a fresh id with its title, model, messages and settings', async () => {
    const store = history()
    const result = await importConversations(store, [
      conversation({ id: 'kept-out', interrupted: true, request_settings: { temperature: 0.3 } }),
      conversation({ title: undefined, name: 'Named instead' }),
    ])
    expect(result.imported).toBe(2)
    expect(result.ids).not.toContain('kept-out')
    const [first, second] = await Promise.all(result.ids.map((id) => store.load(id)))
    expect(first).toMatchObject({
      title: 'Earlier chat',
      model: 'qwen',
      interrupted: true,
      request_settings: { temperature: 0.3 },
      messages: conversation().messages,
    })
    expect(second?.title).toBe('Named instead')
  })

  it('names an untitled conversation and cuts a long title to 200 characters', async () => {
    const store = history()
    const { ids } = await importConversations(store, [
      conversation({ title: undefined }),
      conversation({ title: 'x'.repeat(300) }),
    ])
    expect((await store.load(ids[0]!))?.title).toBe('Imported conversation')
    expect((await store.load(ids[1]!))?.title).toHaveLength(200)
  })

  it('keeps image parts and assistant tool calls', async () => {
    const store = history()
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,cGl4' } },
        ],
      },
      {
        role: 'assistant',
        tool_calls: [{ id: 't', type: 'function', function: { name: 'f', arguments: '{}' } }],
      },
    ]
    const { ids } = await importConversations(store, [conversation({ messages })])
    expect((await store.load(ids[0]!))?.messages).toEqual(messages)
  })

  it.each([
    ['nothing', []],
    ['not a list', { messages: [] }],
    ['more than 100', Array.from({ length: 101 }, () => conversation())],
  ])('refuses %s', async (_, value) => {
    await expect(importConversations(history(), value)).rejects.toMatchObject({
      code: 'ATC_USAGE',
      message: 'Import between 1 and 100 conversations at a time.',
    })
  })

  it.each([
    ['no messages array', conversation({ messages: 'Hello' }), /messages array/],
    ['an unknown role', conversation({ messages: [{ role: 'robot', content: 'x' }] }), /valid role/],
    ['a message without content', conversation({ messages: [{ role: 'user' }] }), /valid role/],
    [
      'a remote image',
      conversation({
        messages: [
          { role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://x.test/a.png' } }] },
        ],
      }),
      /embedded PNG/,
    ],
    [
      'an SVG image',
      conversation({
        messages: [
          {
            role: 'user',
            content: [{ type: 'image_url', image_url: { url: 'data:image/svg+xml;base64,x' } }],
          },
        ],
      }),
      /embedded PNG/,
    ],
  ])('refuses %s and saves nothing from the batch', async (_, bad, message) => {
    const store = history()
    await expect(importConversations(store, [conversation(), bad])).rejects.toMatchObject({
      code: 'ATC_USAGE',
      message: expect.stringMatching(message),
    })
    expect(await store.list()).toEqual([])
  })
})
