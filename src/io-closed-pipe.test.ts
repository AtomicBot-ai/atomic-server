/**
 * A reader that went away closes the pipe: the write fails with EPIPE, and that is the end of the
 * output rather than a command failure the process reports as a crash.
 */
import { EventEmitter } from 'node:events'
import { expect, it } from 'vitest'
import { pipeWriter } from './io.js'

const closedPipe = () => Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })

it('treats a closed output pipe as the end of the output', async () => {
  const refusing = pipeWriter({
    write: () => {
      throw closedPipe()
    },
  })
  expect(() => refusing.write('x')).not.toThrow()
  await expect(refusing.flush()).resolves.toBeUndefined()

  const stream = Object.assign(new EventEmitter(), { write: () => true })
  pipeWriter(stream)
  expect(() => stream.emit('error', closedPipe())).not.toThrow()
  expect(() => stream.emit('error', new Error('write after end'))).toThrow('write after end')
})
