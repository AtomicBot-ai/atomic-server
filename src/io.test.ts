import { describe, expect, it, vi } from 'vitest'
import { exitAfterFlush, pipeWriter, recordingIo } from './io.js'

describe('recordingIo', () => {
  it('records both streams separately and answers questions from its script', async () => {
    const io = recordingIo({ answers: ['yes'] })
    io.stdout('a')
    io.stderr('b')
    expect(io.out).toEqual(['a'])
    expect(io.err).toEqual(['b'])
    expect(await io.question('?')).toBe('yes')
    expect(await io.question('?')).toBe('')
    expect(io.isTTY.stdin).toBe(false)
  })

  it('lets a test override any facet', () => {
    const io = recordingIo({ env: { HOME: '/x' }, columns: 40 })
    expect(io.env['HOME']).toBe('/x')
    expect(io.columns).toBe(40)
  })
})

/** A pipe that takes nothing at once and never emits 'drain': each write's callback runs when `take()` says so. */
function slowPipe() {
  const callbacks: Array<(error?: Error | null) => void> = []
  return {
    write: (_chunk: string, done?: (error?: Error | null) => void) => {
      if (done) callbacks.push(done)
      return false
    },
    take: (error?: Error) => callbacks.splice(0).forEach((done) => done(error)),
  }
}
const settles = (promise: Promise<unknown>) =>
  Promise.race([promise.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), 50))])

describe('pipeWriter', () => {
  it('flushes at once when the pipe took everything', async () => {
    const writer = pipeWriter({ write: (_c: string, done?: () => void) => (done?.(), true) })
    writer.write('a')
    expect(await settles(writer.flush())).toBe(true)
  })

  it('waits until the pipe has taken every write, without waiting for a drain event', async () => {
    const pipe = slowPipe()
    const writer = pipeWriter(pipe)
    writer.write('{"error":')
    writer.write('"ATC_CHECKSUM_MISMATCH"}')
    expect(await settles(writer.flush())).toBe(false)
    pipe.take()
    expect(await settles(writer.flush())).toBe(true)
  })

  it('does not wait on a write the pipe refused for good', async () => {
    const pipe = slowPipe()
    const writer = pipeWriter(pipe)
    writer.write('x')
    pipe.take(new Error('EPIPE'))
    expect(await settles(writer.flush())).toBe(true)
  })
})

describe('pipeWriter on a closed stream', () => {
  it('does not wait on a write that threw', async () => {
    const writer = pipeWriter({
      write: () => {
        throw new Error('write after end')
      },
    })
    expect(() => writer.write('x')).toThrow('write after end')
    expect(await settles(writer.flush())).toBe(true)
  })
})

describe('exitAfterFlush', () => {
  it('sets the exit code before waiting on the output, so a flush that never ends cannot turn it into 0', async () => {
    const proc = { exitCode: undefined as number | undefined, exit: vi.fn() }
    void exitAfterFlush(1, () => new Promise(() => {}), proc)
    expect(proc.exitCode).toBe(1)
    expect(proc.exit).not.toHaveBeenCalled()
  })

  it('exits with the code once the output is flushed', async () => {
    const proc = { exitCode: undefined as number | undefined, exit: vi.fn() }
    await exitAfterFlush(3, async () => {}, proc)
    expect(proc.exit).toHaveBeenCalledWith(3)
  })
})
