import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { prepareAgent } from './prepare.js'
import { runAgent } from './interactive.js'
describe('agent handoff', () => {
  it('launches Codex in the current workspace with its existing home and only an environment credential', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'atc-codex-'))
    try {
      const host = {
        folder,
        cwd: '/project',
        env: { CODEX_HOME: '/existing/codex', CUSTOM: 'preserved' },
        find: (name: string) => (name === 'codex' ? '/bin/codex' : undefined),
        exec: async () => {
          throw new Error('No detection command needed')
        },
      }
      const launch = await prepareAgent('codex', 'http://localhost:14447/v1', 'model', 'secret', host)
      expect(launch.command).toBe('/bin/codex')
      expect(launch.cwd).toBe('/project')
      expect(launch.env).toEqual({ ...host.env, ATC_AGENT_API_KEY: 'secret' })
      expect(launch.args.join(' ')).not.toContain('secret')
      expect(await readdir(folder)).toEqual([])
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })
  it('prepares a private credential file, runs without a shell, and cleans it on exit', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'atc-agent-'))
    try {
      const host = {
        folder,
        cwd: folder,
        env: {},
        find: () => process.execPath,
        exec: async () => ({ code: 0, stdout: '1.4.0', stderr: '', timedOut: false }),
      }
      const launch = await prepareAgent('claude', 'http://localhost:1337/v1', 'm', 'test-key', host)
      const path = launch.args.at(-1)!
      expect(JSON.parse(await readFile(path, 'utf8')).env.ANTHROPIC_AUTH_TOKEN).toBe('test-key')
      if (process.platform !== 'win32') expect((await stat(path)).mode & 0o777).toBe(0o600)
      await runAgent({ ...launch, args: ['-e', 'process.exit(0)'] })
      expect(await readdir(join(folder, 'claude'))).toEqual([])
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })
  it('reports missing agents without installing or changing anything', async () => {
    await expect(
      prepareAgent('atomic-agent', 'http://localhost:1/v1', 'm', '', {
        folder: '/never-write',
        cwd: '/',
        env: {},
        find: () => undefined,
        exec: async () => {
          throw new Error('unexpected')
        },
      })
    ).rejects.toThrow('not installed on PATH')
  })
})
