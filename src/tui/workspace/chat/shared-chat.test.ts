import { expect, it, vi } from 'vitest'
import { sharedChat } from './shared-chat.js'
import type { WorkspaceRuntime } from '../runtime.js'
it('sends prepared documents and feature choices through shared jobs without mutating drafts', async () => {
  const read = vi.fn(async (operation: string) =>
    operation === 'attachments.prepare'
      ? { content: 'Prepared excerpt' }
      : {
          id: 'job',
          state: 'complete',
          conversation_id: 'chat',
          message: {
            role: 'assistant',
            content: 'Answer',
            tool_calls: [{ id: 'call', type: 'function', function: { name: 'echo', arguments: '{}' } }],
          },
        }
  )
  const messages = [{ role: 'user' as const, content: 'Review' }],
    onText = vi.fn()
  const response = await sharedChat(
    { read } as unknown as WorkspaceRuntime,
    'model',
    messages,
    { atomic_assistant: 'reviewer' },
    new AbortController().signal,
    onText,
    'chat',
    [{ name: 'file.txt', text: 'Full source' }]
  )
  expect(messages[0]?.content).toBe('Review')
  expect(read).toHaveBeenCalledWith('attachments.prepare', {
    name: 'file.txt',
    content: 'Full source',
    query: 'Review',
  })
  expect(read).toHaveBeenCalledWith('chat.start', {
    conversation_id: 'chat',
    request: {
      model: 'model',
      atomic_assistant: 'reviewer',
      messages: [{ role: 'user', content: expect.stringContaining('Prepared excerpt') }],
    },
  })
  expect(response?.message.tool_calls?.[0]?.id).toBe('call')
  expect(response?.messages[0]?.content).toContain('Prepared excerpt')
  expect(onText).toHaveBeenCalledWith('Answer')
})
it('cancels a server-owned job when the terminal turn is stopped', async () => {
  const controller = new AbortController()
  const read = vi.fn(async (operation: string) => {
    if (operation === 'chat.start') controller.abort()
    return { id: 'job', state: 'generating', message: { role: 'assistant', content: '' } }
  })
  expect(
    await sharedChat({ read } as unknown as WorkspaceRuntime, 'model', [], {}, controller.signal, () => {})
  ).toBeUndefined()
  expect(read).toHaveBeenCalledWith('chat.cancel', { id: 'job' })
})
it('applies the edited system prompt once without leaking internal draft fields to inference', async () => {
  const read = vi.fn(async () => ({
    id: 'job',
    state: 'complete',
    conversation_id: 'chat',
    message: { role: 'assistant', content: 'Done' },
  }))
  const messages = [
    { role: 'system' as const, content: 'Old prompt' },
    { role: 'user' as const, content: 'Question' },
  ]
  await sharedChat(
    { read } as unknown as WorkspaceRuntime,
    'model',
    messages,
    { atomic_system: 'New prompt', temperature: 0.4 },
    new AbortController().signal,
    () => {}
  )
  expect(read).toHaveBeenCalledWith('chat.start', {
    request: {
      model: 'model',
      temperature: 0.4,
      messages: [{ role: 'system', content: 'New prompt' }, messages[1]],
    },
  })
  expect(messages[0]!.content).toBe('Old prompt')
})
