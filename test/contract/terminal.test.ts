import { afterEach, describe, expect, it, vi } from 'vitest'
import { testRun } from '../helpers/test-context.js'
import type { TestRun } from '../helpers/test-context.js'
let t: TestRun

afterEach(() => t?.cleanup())
describe('plain terminal operations', () => {
  it('starts the configured API, reads its status, and stops it without shutting down the owner', async () => {
    t = testRun()
    t.io.env['ATC_API_KEY'] = 'test-only'
    expect(await t.run(['api', 'start', '--port', '14567', '--json'])).toBe(0)
    expect(t.link.calls).toContainEqual({
      method: 'POST',
      path: '/server/start',
      body: expect.objectContaining({ port: 14567, api_key: 'test-only', fallback_port: false }),
    })
    expect(await t.run(['api', 'status'])).toBe(0)
    expect(await t.run(['api', 'stop'])).toBe(0)
    expect(t.link.shutdowns).toBe(0)
  })
  it('shares streaming chat with the TUI and produces a single JSON result', async () => {
    const request = vi.fn(
      async () => new Response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n')
    )
    t = testRun({ io: { fetch: request as typeof fetch } })
    expect(
      await t.run([
        'chat',
        '--endpoint',
        'http://fixture/v1',
        '--model',
        'test-model',
        '--json',
        'Say',
        'hello',
      ])
    ).toBe(0)
    expect(JSON.parse(t.io.out.join(''))).toEqual({ model: 'test-model', reply: 'Hello' })
  })
})

describe('atc chat with a managed model', () => {
  it('turns a context overflow into the limit, the request length and the setting to raise', async () => {
    const message =
      "This model's maximum context length is 4096 tokens, but the request has 5120 tokens. Shorten the conversation or the requested output."
    const request = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { message, code: 'context_length_exceeded' } }), { status: 400 })
    )
    t = testRun({ io: { fetch: request as typeof fetch } })
    t.link.snapshotValue.sessions = [{ provider: 'vllm', model_id: 'qwen', port: 0 } as never]
    expect(await t.run(['chat', '--endpoint', 'http://fixture/v1', '--model', 'qwen', 'hi'])).not.toBe(0)
    expect(t.io.err.join('')).toContain('(5120 tokens)')
    expect(t.io.err.join('')).toContain('atc config set engine.vllm.context_length')
  })
})
