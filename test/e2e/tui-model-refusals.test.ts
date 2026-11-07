import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { ATC } from '../helpers/binary.js'
import { runAtcAsync, runProcess } from '../helpers/async-binary.js'
import { fakeManagedMachine } from '../helpers/fake-managed-machine.js'
import { FixtureHttpServer } from '../helpers/fixture-http-server.js'
import { qwenFiles, serveRepository } from '../helpers/hf-hub.js'
import { DRIVER, hasPython, type PtyResult } from '../helpers/pty-driver.js'
import { readyWorkspace } from '../helpers/ready-workspace.js'
import { reportCollector } from '../helpers/report-collector.js'
import { tmpDataFolder } from '../helpers/tmp-data-folder.js'

it.skipIf(process.platform === 'win32' || !hasPython())(
  'shows managed-engine incompatibility without downloading or sending a TUI error report',
  async () => {
    const tmp = tmpDataFolder(),
      machine = await fakeManagedMachine(),
      hf = new FixtureHttpServer(),
      collector = await reportCollector()
    const repository = 'fixture/bad-model'
    serveRepository(hf, repository, qwenFiles({ architectures: ['UnsupportedFixtureForCausalLM'] }))
    const expand = new URLSearchParams()
    for (const field of ['config', 'safetensors', 'downloads', 'likes', 'tags'])
      expand.append('expand[]', field)
    hf.files.set(`/api/models/${repository}?${expand}`, {
      body: Buffer.from(
        JSON.stringify({ id: repository, config: { architectures: ['UnsupportedFixtureForCausalLM'] } })
      ),
    })
    const search = new URLSearchParams({
      search: repository,
      filter: 'safetensors',
      limit: '50',
      sort: 'downloads',
    })
    for (const [key, value] of expand) search.append(key, value)
    hf.files.set(`/api/models?${search}`, { body: Buffer.from('[]') })
    const env = {
      ...process.env,
      ...machine.env,
      TERM: 'xterm-256color',
      HF_ENDPOINT: await hf.start(),
      ATOMIC_CORE_MANAGED_ROOT: join(tmp.paths.dataFolder, 'managed'),
      ATC_SENTRY_DSN: collector.dsn,
      ATC_SENTRY_ENVIRONMENT: 'e2e',
      DO_NOT_TRACK: '0',
      ATOMIC_CORE_TELEMETRY: '1',
    }
    const run = (...args: string[]) =>
      runAtcAsync([...args, '--data-folder', tmp.paths.dataFolder, '--json'], { env })
    readyWorkspace(tmp.paths.dataFolder)
    writeFileSync(
      join(tmp.paths.atcDir, 'tui-catalog.json'),
      JSON.stringify({
        libraryCategory: 'text',
        libraryFormat: 'safetensors',
        libraryQuery: repository,
        catalogFilters: { engine: 'vllm' },
      })
    )
    try {
      const started = await run('start', '--admin-port', '0')
      expect(started.code, started.err).toBe(0)
      const checked = await run('control', 'call', 'models.check', '--input', JSON.stringify({ repository }))
      expect(checked.code, checked.err).toBe(0)
      const verdicts = JSON.parse(checked.out).result.verdicts as Array<{
        compatibility: { verdict: { ok: boolean } } | null
      }>
      expect(verdicts.length).toBeGreaterThan(0)
      expect(verdicts.every((v) => !v.compatibility?.verdict.ok)).toBe(true)
      const steps = [
        { wait: 'Agents & tools' },
        { type: '\u001b3' },
        { wait: repository },
        { click: repository },
        { click: 'Download' },
        { wait: 'refused', fresh: true },
        { type: '\u001b1' },
        { wait: 'Agents & tools', fresh: true },
        { type: '\u0011' },
      ]
      const process = await runProcess(
        'python3',
        ['-c', DRIVER, JSON.stringify(steps), ...ATC, '--data-folder', tmp.paths.dataFolder],
        { env, timeoutMs: 90_000 }
      )
      expect(process.code, process.err).toBe(0)
      const session = JSON.parse(process.out.trim().split('\n').at(-1)!) as PtyResult
      expect(session.ok, session.failed.join(', ') + '\n' + session.out.slice(-2500)).toBe(true)
      expect(session.code).toBe(0)
      expect(collector.events).toHaveLength(0)
      expect(machine.pulls).toEqual([])
      expect(existsSync(join(tmp.paths.atcDir, 'managed-model-setups'))).toBe(false)
      const jobs = await run('control', 'call', 'managed.list')
      expect(jobs.code, jobs.err).toBe(0)
      expect(JSON.parse(jobs.out).result).toEqual([])
    } finally {
      await run('stop', '--force', '--kill')
      await collector.close()
      await hf.stop()
      await machine.close()
      rmSync(machine.dir, { recursive: true, force: true })
      tmp.cleanup()
    }
  }
)
