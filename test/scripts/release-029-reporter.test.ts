import { expect, it, vi } from 'vitest'
import Release029Reporter from '../../scripts/release-029-reporter.mjs'

it('accepts a clean run and only the exact known reporting timeout', () => {
  const reporter = new Release029Reporter()
  expect(() => reporter.onFinished([])).not.toThrow()
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  try {
    expect(() =>
      reporter.onFinished([], [new Error('[vitest-worker]: Timeout calling "onTaskUpdate"')])
    ).not.toThrow()
    expect(warn).toHaveBeenCalledOnce()
  } finally {
    warn.mockRestore()
  }
})

it.each([
  'Test timed out in 30000ms.',
  'Unexpected engine failure',
  '[vitest-worker]: Timeout calling "onUnhandledError"',
])('refuses any other error, including beside a known timeout: %s', (message) => {
  expect(() =>
    new Release029Reporter().onFinished(
      [],
      [new Error('[vitest-worker]: Timeout calling "onTaskUpdate"'), new Error(message)]
    )
  ).toThrow('Release exception refuses unexpected runner errors')
})
