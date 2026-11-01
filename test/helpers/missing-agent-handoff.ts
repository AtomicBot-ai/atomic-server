import { existsSync, mkdirSync, readdirSync, symlinkSync } from 'node:fs'
import { delimiter, join, resolve } from 'node:path'
import { AGENTS } from '../../src/agent-launch/index.js'
import { reportCollector } from './report-collector.js'
import { DRIVER, type PtyResult } from './pty-driver.js'
import { runProcess } from './async-binary.js'

/** Keep host utilities available but make missing agents deterministic, even on a developer's machine. */
export async function missingAgentHandoff(command: string[], env: NodeJS.ProcessEnv, scratch: string) {
  const bin = join(scratch, 'without-agents')
  mkdirSync(bin)
  const blocked = new Set<string>(AGENTS.flatMap((agent) => [...agent.bins]))
  for (const directory of (env['PATH'] ?? '').split(delimiter).filter(Boolean)) {
    let names: string[]
    try {
      names = readdirSync(directory)
    } catch {
      continue
    }
    for (const name of names) {
      if (blocked.has(name) || existsSync(join(bin, name))) continue
      try {
        symlinkSync(resolve(directory, name), join(bin, name))
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      }
    }
  }
  const collector = await reportCollector()
  try {
    // The collector must keep processing requests while the interactive command is running.
    const process = await runProcess('python3', ['-c', DRIVER, '[]', ...command], {
      env: {
        ...env,
        PATH: bin,
        TERM: 'xterm-256color',
        ATC_SENTRY_DSN: collector.dsn,
        ATC_SENTRY_ENVIRONMENT: 'e2e',
        DO_NOT_TRACK: '0',
        ATOMIC_CORE_TELEMETRY: '1',
      },
      timeoutMs: 90_000,
    })
    if (process.code !== 0) throw new Error(`pty driver: ${process.err}`)
    const result = JSON.parse(process.out.trim().split('\n').at(-1)!) as PtyResult
    return { ...result, events: collector.events }
  } finally {
    await collector.close()
  }
}
