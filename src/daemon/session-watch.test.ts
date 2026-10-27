import { describe, expect, it, vi } from 'vitest'
import { createLogger } from '../output/index.js'
import type { LogEntry } from '../output/index.js'
import { CrashPolicy, sessionEventLine, watchSessions } from './session-watch.js'

const died = (over: Record<string, unknown> = {}) => ({
  provider: 'llamacpp-upstream',
  model_id: 'qwen3-8b',
  pid: 4242,
  exit_code: null,
  signal: 'SIGKILL',
  message: 'The model process crashed unexpectedly.',
  ...over,
})

describe('sessionEventLine', () => {
  it.each([
    [
      'a death is a warning with the exit and the reason',
      'session:died',
      died(),
      [
        'warn',
        'qwen3-8b on llamacpp-upstream died (signal SIGKILL): The model process crashed unexpectedly.',
      ],
    ],
    [
      'an exit code when there is one',
      'session:died',
      died({ exit_code: 139, signal: null }),
      ['warn', 'qwen3-8b on llamacpp-upstream died (exit code 139): The model process crashed unexpectedly.'],
    ],
    [
      'an unload is information',
      'session:unloaded',
      { provider: 'mlx', model_id: 'm', pid: 1 },
      ['info', 'm on mlx unloaded'],
    ],
    ['anything else is nothing', 'session:load-progress', { stage: 'ready' }, undefined],
  ])('%s', (_name, event, payload, expected) => {
    expect(sessionEventLine(event, payload)).toEqual(expected && { level: expected[0], message: expected[1] })
  })
})

describe('CrashPolicy', () => {
  it('allows three restarts of a model within ten minutes, then gives up until the window passes', () => {
    const policy = new CrashPolicy({ maxRestarts: 3, windowMs: 600_000 })
    expect(policy.decide('a', 0)).toBe('restart')
    expect(policy.decide('a', 1_000)).toBe('restart')
    expect(policy.decide('a', 2_000)).toBe('restart')
    expect(policy.decide('a', 3_000)).toBe('give-up')
    expect(policy.decide('b', 3_000)).toBe('restart')
    expect(policy.decide('a', 601_000)).toBe('restart')
  })
})

describe('watchSessions', () => {
  function harness() {
    const lines: LogEntry[] = []
    const reload = vi.fn(async (_provider: string, _model: string) => {})
    let now = 0
    const watch = watchSessions({
      reload,
      log: createLogger((e) => lines.push(e), { level: 'debug' }),
      policy: new CrashPolicy({ maxRestarts: 1, windowMs: 600_000 }),
      now: () => now,
    })
    return {
      lines,
      reload,
      watch,
      tick: (ms: number) => (now += ms),
      text: () => lines.map((l) => `${l.level} ${l.message}`),
    }
  }

  it('logs a death and loads the model again, once per window', async () => {
    const h = h0()
    await h.watch.handle('session:died', died())
    expect(h.reload).toHaveBeenCalledWith('llamacpp-upstream', 'qwen3-8b')
    expect(h.text()).toEqual([
      'warn qwen3-8b on llamacpp-upstream died (signal SIGKILL): The model process crashed unexpectedly.',
      'info qwen3-8b on llamacpp-upstream: restarting (1 of 1 within 10 min)',
      'info qwen3-8b on llamacpp-upstream restarted',
    ])
    h.tick(1_000)
    await h.watch.handle('session:died', died())
    expect(h.reload).toHaveBeenCalledTimes(1)
    expect(h.text().at(-1)).toBe(
      'warn qwen3-8b on llamacpp-upstream: not restarted again (1 restarts within 10 min); run it by hand'
    )
    function h0() {
      return harness()
    }
  })

  it('reports a restart that fails, and nothing after stop()', async () => {
    const h = harness()
    h.reload.mockRejectedValueOnce(new Error('no such file'))
    await h.watch.handle('session:died', died())
    expect(h.text().at(-1)).toBe('warn qwen3-8b on llamacpp-upstream: restart failed: no such file')
    h.watch.stop()
    h.lines.length = 0
    await h.watch.handle('session:died', died({ model_id: 'other' }))
    expect(h.reload).toHaveBeenCalledTimes(1)
    expect(h.lines).toEqual([])
  })

  it('only logs an unload', async () => {
    const h = harness()
    await h.watch.handle('session:unloaded', { provider: 'mlx', model_id: 'm', pid: 1 })
    expect(h.reload).not.toHaveBeenCalled()
    expect(h.text()).toEqual(['info m on mlx unloaded'])
  })
})
