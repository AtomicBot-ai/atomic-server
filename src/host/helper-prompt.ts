import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { parseHostStepRequest, resultPathFor } from '@atomic-chat/core/host'
import { AtcError } from '../errors/index.js'
import type { Elevator } from './elevator.js'

/** Runs in the user's terminal; only the SDK helper invoked by sudo receives elevated rights. */
export async function promptHostStep(requestPath: string, digest: string, elevator: Elevator) {
  const text = await readFile(requestPath, 'utf8')
  const parsed = parseHostStepRequest(text),
    resultPath = resultPathFor(requestPath)
  if (
    !parsed.ok ||
    !resultPath ||
    basename(requestPath) !== parsed.request.step_id + '.request.json' ||
    !/^[a-f0-9]{64}$/.test(digest) ||
    createHash('sha256').update(text).digest('hex') !== digest
  )
    throw new AtcError('ATC_USAGE', 'The host authorization request changed before the terminal opened.')
  const existing = await readFile(resultPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (existing !== null) return JSON.parse(existing).outcome === 'failed' ? 1 : 0
  // The terminal also signals sudo and its foreground helper. Stay alive until that child
  // finishes; a signal alone is not evidence that the privileged transaction has stopped.
  const signals = ['SIGINT', 'SIGHUP', 'SIGTERM'] as const
  const waitForHelper = () => {}
  for (const signal of signals) process.on(signal, waitForHelper)
  try {
    const outcome = await elevator.run('sudo-tty', requestPath, digest)
    if (outcome.kind !== 'result') throw new AtcError('ATC_USAGE', 'Terminal authorization did not run.')
    // sudo refusal has no SDK result. Persist a bound failure so the server does not wait forever.
    const result = {
      ...parsed.request,
      error_code: null,
      outcome: 'failed',
      exit_code: outcome.result.exit_code || null,
      log_tail: outcome.result.log_tail,
      finished_at: Date.now(),
      steps: [],
    }
    try {
      await writeFile(resultPath, JSON.stringify(result), { flag: 'wx', mode: 0o600 })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    return outcome.result.outcome === 'completed' ? 0 : 1
  } finally {
    for (const signal of signals) process.off(signal, waitForHelper)
  }
}
