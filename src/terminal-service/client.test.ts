import { describe, expect, it, vi } from 'vitest'
import { failureReport } from '../telemetry/index.js'
import { endpointUrl, sameEndpoint, listChatModels, streamChat } from './client.js'

function response(chunks: string[]) {
  const cancel = vi.fn()
  const bytes = new TextEncoder().encode(chunks.join(''))
  // Deliberately split every UTF-8 character and SSE field across reads.
  let at = 0
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (at < bytes.length) c.enqueue(bytes.slice(at, ++at))
      else c.close()
    },
    cancel,
  })
  return { response: new Response(body), cancel }
}
const delta = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\r\n\r\n`
describe('OpenAI-compatible terminal client', () => {
  it('normalizes endpoints and rejects credentials and unexpected protocols', () => {
    expect(endpointUrl('http://localhost:1337/v1/')).toBe('http://localhost:1337/v1')
    for (const url of [
      'file:///tmp/key',
      'https://a:b@host/v1',
      'https://host/v1?key=a',
      'https://host/v1#x',
    ])
      expect(() => endpointUrl(url)).toThrow()
  })
  it('discovers models with authentication and no cross-origin redirects', async () => {
    const request = vi.fn(async () => Response.json({ data: [{ id: 'local' }, { id: 7 }] }))
    expect(await listChatModels('https://host/v1/', request as typeof fetch, 'secret')).toEqual(['local'])
    expect(request).toHaveBeenCalledWith(
      'https://host/v1/models',
      expect.objectContaining({ redirect: 'error', headers: { Authorization: 'Bearer secret' } })
    )
  })
  it('streams fragmented Unicode, ignores SSE comments, and cancels the reader on DONE', async () => {
    const r = response([
      ': heartbeat\n',
      delta('Hello '),
      delta('世界 👁'),
      'data: [DONE]\n\n',
      delta('discard'),
    ])
    const output: string[] = []
    await streamChat({
      endpoint: 'http://host/v1',
      model: 'm',
      messages: [{ role: 'user', content: 'Hi' }],
      request: vi.fn(async () => r.response) as typeof fetch,
      signal: new AbortController().signal,
      onText: (s) => output.push(s),
    })
    expect(output.join('')).toBe('Hello 世界 👁')
    expect(r.cancel).toHaveBeenCalled()
  })
  it('keeps partial content while reporting a prematurely closed stream', async () => {
    const r = response([delta('partial')]),
      output: string[] = []
    await expect(
      streamChat({
        endpoint: 'http://host/v1',
        model: 'm',
        messages: [],
        request: vi.fn(async () => r.response) as typeof fetch,
        signal: new AbortController().signal,
        onText: (s) => output.push(s),
      })
    ).rejects.toThrow('partial reply is kept')
    expect(output).toEqual(['partial'])
  })
  it('does not expose remote error bodies or keys in errors', async () => {
    await expect(
      streamChat({
        endpoint: 'http://host/v1',
        model: 'm',
        messages: [],
        request: vi.fn(async () => new Response('secret-provider-key', { status: 401 })) as typeof fetch,
        signal: new AbortController().signal,
        onText: () => undefined,
      })
    ).rejects.toThrow('HTTP 401')
  })
})

it('sends vision content parts unchanged and renders attachment labels without exposing base64', async () => {
  const { messageText } = await import('./client.js')
  const content = [
    { type: 'text' as const, text: 'Describe this' },
    { type: 'image_url' as const, image_url: { url: 'data:image/png;base64,cGl4ZWxz' } },
  ]
  const request = vi.fn(async () => new Response('data: [DONE]\n\n'))
  await streamChat({
    endpoint: 'http://host/v1',
    model: 'vision',
    messages: [{ role: 'user', content }],
    request: request as typeof fetch,
    signal: new AbortController().signal,
    onText: () => undefined,
  })
  expect(request).toHaveBeenCalledWith(
    'http://host/v1/chat/completions',
    expect.objectContaining({
      body: JSON.stringify({ model: 'vision', messages: [{ role: 'user', content }], stream: true }),
    })
  )
  expect(messageText(content)).toBe('Describe this\n[Image]')
})

describe('a refused chat request', () => {
  it('says what the server answered, not only the status', async () => {
    const answer = {
      error: {
        message: "This model's maximum context length is 4096 tokens, but the request has 5120 tokens.",
        code: 'context_length_exceeded',
      },
    }
    await expect(
      streamChat({
        endpoint: 'http://host/v1',
        model: 'm',
        messages: [{ role: 'user', content: 'Hi' }],
        request: vi.fn(async () => new Response(JSON.stringify(answer), { status: 400 })) as typeof fetch,
        signal: new AbortController().signal,
        onText: () => {},
      })
    ).rejects.toThrow('maximum context length is 4096 tokens')
  })
})

describe('CLI chat failure reports', () => {
  const context = { component: 'cli', operation: 'chat' }

  async function chatFailure(reply: () => Response, endpoint = 'http://host/v1'): Promise<unknown> {
    return streamChat({
      endpoint,
      model: 'm',
      messages: [],
      request: vi.fn<typeof fetch>(async () => reply()),
      signal: new AbortController().signal,
      onText: () => {},
    }).catch((cause: unknown) => cause)
  }

  it.each([
    {
      code: 'CLI_CHAT_ENDPOINT_INVALID',
      endpoint: 'file:///private-fixture',
      reply: () => new Response(null),
    },
    { code: 'CLI_CHAT_EMPTY_RESPONSE', reply: () => new Response(null) },
    {
      code: 'CLI_CHAT_GENERATION_ERROR',
      reply: () => new Response('data: {"error":{"message":"private-fixture"}}\n\n'),
    },
    { code: 'CLI_CHAT_STREAM_TRUNCATED', reply: () => new Response(delta('partial reply')) },
  ])('reports $code only from the local client branch', async ({ code, endpoint, reply }) => {
    const error = await chatFailure(reply, endpoint)
    const report = failureReport(error, context)
    expect(report).toMatchObject({
      level: 'error',
      error: { name: 'Error', message: 'Unexpected failure in chat' },
      tags: { ...context, diagnostic_code: code },
    })
    expect(JSON.stringify(report)).not.toContain('private-fixture')
  })

  it('keeps a matching message from a remote HTTP error out of the local diagnostic tags', async () => {
    const message = 'The response ended before completion. The partial reply is kept.'
    const error = await chatFailure(() => Response.json({ error: { message } }, { status: 502 }))

    expect(error).toMatchObject({ message })
    const report = failureReport(error, context)
    expect(report).toMatchObject({ error: { message: 'Unexpected failure in chat' }, tags: context })
    expect(report?.tags).not.toHaveProperty('diagnostic_code')
  })
})

it('matches loopback aliases without treating a different listener or API path as local', () => {
  const local = 'http://127.0.0.1:63163/v1'
  expect(sameEndpoint('http://localhost:63163/v1/', local)).toBe(true)
  expect(sameEndpoint('http://[::1]:63163/v1', local)).toBe(true)
  for (const other of [
    'http://127.0.0.1:1337/v1',
    'https://127.0.0.1:63163/v1',
    'http://localhost:63163/other',
    'http://host:63163/v1',
    'http://user:secret@localhost:63163/v1',
  ])
    expect(sameEndpoint(other, local)).toBe(false)
})
