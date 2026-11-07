import { expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fastFlowLmHostRequest } from '@atomic-chat/core/client'
import type { FastFlowLmOperation } from '@atomic-chat/core/contracts'
import wire from '../../test/fixtures/fastflowlm/operation.json' with { type: 'json' }
import { promptHostStep } from './helper-prompt.js'
import type { Elevator } from './elevator.js'

it('binds the terminal prompt, records sudo refusal, and never repeats a finished authorization', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'atc-prompt-'))
  const request = join(dir, wire.pending_host_step.step_id + '.request.json')
  const result = request.replace('.request.json', '.result.json')
  const bound = await fastFlowLmHostRequest(wire as FastFlowLmOperation, '/data')
  const run = vi.fn<Elevator['run']>(async () => ({
    kind: 'result',
    result: {
      schema_version: 1,
      step_id: '',
      outcome: 'declined',
      exit_code: 1,
      log_tail: 'sudo: incorrect password attempts',
      finished_at: 1,
    },
  }))
  const elevator: Elevator = { select: () => 'sudo-tty', run }
  try {
    await writeFile(request, bound.text)
    await expect(promptHostStep(request, '0'.repeat(64), elevator)).rejects.toThrow('changed')
    expect(run).not.toHaveBeenCalled()
    expect(await promptHostStep(request, bound.sha256, elevator)).toBe(1)
    expect(JSON.parse(await readFile(result, 'utf8'))).toMatchObject({
      nonce: wire.pending_host_step.nonce,
      outcome: 'failed',
      exit_code: 1,
      error_code: null,
    })
    expect(await promptHostStep(request, bound.sha256, elevator)).toBe(1)
    expect(run).toHaveBeenCalledExactlyOnceWith('sudo-tty', request, bound.sha256)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
