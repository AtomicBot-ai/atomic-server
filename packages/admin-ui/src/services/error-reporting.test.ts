import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminApiError } from './admin-api'
import { createBrowserReporter } from './error-reporting'
afterEach(() => vi.restoreAllMocks())

describe('browser errors', () => {
  it('sends only the exception category and local asset frames', async () => {
    const send = vi.fn<(body: unknown) => Promise<void>>(async () => {})
    const reporter = createBrowserReporter(send)
    const error = new TypeError('Prompt: secret prompt; reply: secret reply')
    error.stack =
      'TypeError: secret prompt\n    at render (http://localhost:1338/assets/index-Abc12.js:10:20)\n    at http://external.example/private.js:1:2'
    reporter.capture(error, 'react')
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(send.mock.calls[0]?.[0]).toEqual({
      kind: 'react',
      name: 'TypeError',
      frames: ['    at render (/assets/index-Abc12.js:10:20)'],
    })
    expect(JSON.stringify(send.mock.calls)).not.toMatch(/secret|localhost|external/)
  })
  it('does not repeat a server refusal, cancellation or the same exception', async () => {
    const send = vi.fn<(body: unknown) => Promise<void>>(async () => {})
    const reporter = createBrowserReporter(send),
      error = new TypeError('local defect')
    reporter.capture(new AdminApiError('ATC_INTERNAL', 'server defect', { status: 500 }), 'action')
    reporter.capture(new DOMException('cancelled', 'AbortError'), 'action')
    reporter.capture(error, 'action')
    reporter.capture(error, 'unhandled_rejection')
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
  })
  it('captures global failures and removes its listeners on cleanup', async () => {
    const send = vi.fn<(body: unknown) => Promise<void>>(async () => {})
    const target = new EventTarget() as unknown as Window
    const reporter = createBrowserReporter(send),
      stop = reporter.install(target)
    target.dispatchEvent(new ErrorEvent('error', { error: new ReferenceError('bug') }))
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    stop()
    target.dispatchEvent(new ErrorEvent('error', { error: new ReferenceError('another bug') }))
    expect(send).toHaveBeenCalledTimes(1)
  })
})
