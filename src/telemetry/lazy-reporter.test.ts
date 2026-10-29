import { afterEach, expect, it, vi } from 'vitest'
import { AtcErrorReporter } from './reporter.js'
import { LazyErrorReporter } from './lazy-reporter.js'
afterEach(() => vi.useRealTimers())
const report = { source: 'startup' as const, level: 'fatal' as const, error: new Error('test') }
it('does not initialize on success and initializes once for multiple captures', async () => {
  const create = vi.fn(async () => new AtcErrorReporter(undefined, true))
  const reporter = new LazyErrorReporter(create)
  await reporter.flush()
  expect(create).not.toHaveBeenCalled()
  reporter.capture(report)
  reporter.capture(report)
  await reporter.flush()
  expect(create).toHaveBeenCalledTimes(1)
})
it('bounds hung initialization and does not throw if the factory fails synchronously', async () => {
  vi.useFakeTimers()
  const reporter = new LazyErrorReporter(() => new Promise(() => {}))
  reporter.capture(report)
  const flushed = reporter.flush(50)
  await vi.advanceTimersByTimeAsync(50)
  await flushed
  let secondDone = false
  void reporter.flush(50).then(() => {
    secondDone = true
  })
  await vi.advanceTimersByTimeAsync(0)
  expect(secondDone).toBe(true)
  const broken = new LazyErrorReporter(() => {
    throw new Error('bad config')
  })
  expect(() => broken.capture(report)).not.toThrow()
  await broken.flush(50)
})

it('removes arbitrary user content from process-level fatal reports too', async () => {
  const base = new AtcErrorReporter(undefined, true)
  const capture = vi.spyOn(base, 'capture')
  const reporter = new LazyErrorReporter(async () => base)
  reporter.capture({ source: 'uncaught_exception', level: 'fatal', error: new Error('private-prompt-value') })
  await reporter.flush()
  const error = capture.mock.calls[0]?.[0].error as Error
  expect(error.message).not.toContain('private-prompt-value')
  expect(error.stack).not.toContain('private-prompt-value')
})

it('routes send failures to the server logger even after initialization', async () => {
  let notify!: (message: string) => void
  const reporter = new LazyErrorReporter(async (_consent, warn) => {
    notify = warn
    return new AtcErrorReporter(undefined, true)
  })
  reporter.capture(report)
  await reporter.flush()
  const warn = vi.fn()
  reporter.setWarningHandler(warn)
  notify('HTTP 429')
  expect(warn).toHaveBeenCalledWith('HTTP 429')
})
