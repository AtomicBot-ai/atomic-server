import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { fastFlowLmHostRequest } from '@atomic-chat/core/client'
import type { FastFlowLmOperation } from '@atomic-chat/core/contracts'
import wire from '../fixtures/fastflowlm/operation.json' with { type: 'json' }
import { ATC } from '../helpers/binary.js'

it.skipIf(process.platform === 'win32').each(['SIGINT', 'SIGHUP'] as const)(
  'records a bound failure after %s without losing or prematurely finishing the helper',
  async (signal) => {
    const dir = await mkdtemp(join(tmpdir(), 'atc-prompt-signal-'))
    const request = join(dir, wire.pending_host_step.step_id + '.request.json')
    const result = request.replace('.request.json', '.result.json')
    const bound = await fastFlowLmHostRequest(wire as FastFlowLmOperation, join(dir, 'data'))
    // A local fake sudo reports when its transaction has finished. No root process is started.
    await writeFile(
      join(dir, 'sudo'),
      '#!/bin/sh\necho PROMPT_READY\ni=0\nwhile [ ! -f "$ATC_TEST_PROMPT_RELEASE" ] && [ "$i" -lt 300 ]; do sleep 0.01; i=$((i+1)); done\nexit 1\n',
      { mode: 0o700 }
    )
    await writeFile(request, bound.text)
    const child = spawn(
      ATC[0]!,
      [
        ...ATC.slice(1),
        'host-step',
        'prompt',
        request,
        '--request-sha256',
        bound.sha256,
        '--data-folder',
        join(dir, 'data'),
      ],
      {
        env: {
          ...process.env,
          PATH: dir + ':' + process.env.PATH,
          DO_NOT_TRACK: '1',
          ATC_TEST_PROMPT_RELEASE: join(dir, 'release'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    )
    const exited = new Promise<number | null>((resolve, reject) => {
      child.once('error', reject)
      child.once('exit', resolve)
    })
    try {
      await new Promise<void>((resolve, reject) => {
        child.stdout.on('data', (chunk) => {
          if (String(chunk).includes('PROMPT_READY')) resolve()
        })
        child.once('exit', () => reject(Error('Authorization exited before starting')))
      })
      child.kill(signal)
      expect(await readFile(result, 'utf8').catch(() => null)).toBeNull()
      await writeFile(join(dir, 'release'), '')
      expect(await exited).toBe(1)
      expect(JSON.parse(await readFile(result, 'utf8'))).toMatchObject({
        outcome: 'failed',
        nonce: wire.pending_host_step.nonce,
        exit_code: 1,
      })
    } finally {
      child.kill('SIGKILL')
      await rm(dir, { recursive: true, force: true })
    }
  },
  10000
)
