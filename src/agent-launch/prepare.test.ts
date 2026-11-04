import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AGENTS } from './plan.js'
import { prepareAgent } from './prepare.js'
import { runAgent } from './interactive.js'
/** A model list that names no window, as a core before 0.21 serves it. */
const noWindow = (async () => Response.json({ data: [{ id: 'model' }] })) as typeof fetch
const served = (window: number) =>
  (async () => Response.json({ data: [{ id: 'model', context_length: window }] })) as typeof fetch
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
        platform: 'linux' as const,
        request: noWindow,
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
        platform: process.platform,
        request: noWindow,
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
  it.each(AGENTS)('refuses missing $name as usage without probing or writing a profile', async (agent) => {
    const folder = await mkdtemp(join(tmpdir(), 'atc-missing-agent-'))
    const exec = vi.fn(async () => {
      throw new Error('unexpected version probe')
    })
    const find = vi.fn<(name: string) => string | undefined>(() => undefined)
    try {
      await expect(
        prepareAgent(agent.id, 'http://localhost:1/v1', 'm', 'private-key', {
          folder,
          cwd: '/',
          env: {},
          find,
          exec,
          platform: 'linux',
          request: noWindow,
        })
      ).rejects.toMatchObject({
        code: 'ATC_USAGE',
        message: `${agent.name} is not installed on PATH. Install it from ${agent.docs}`,
      })
      expect(find.mock.calls.map((call) => call[0])).toEqual([...agent.bins])
      expect(exec).not.toHaveBeenCalled()
      expect(await readdir(folder)).toEqual([])
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })
  it('tells the agent the window the model is served with', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'atc-window-'))
    try {
      const launch = await prepareAgent('codex', 'http://localhost:1/v1', 'model', 'key', {
        folder,
        cwd: '/',
        env: {},
        find: () => '/bin/codex',
        exec: vi.fn(),
        platform: 'linux',
        request: served(65536),
      })
      expect(launch.args).toEqual(
        expect.arrayContaining(['model_context_window=65536', 'model_auto_compact_token_limit=49152'])
      )
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })
  it('refuses a window smaller than the agent needs, before writing a profile', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'atc-small-window-'))
    try {
      await expect(
        prepareAgent('atomic-agent', 'http://localhost:1/v1', 'model', 'key', {
          folder,
          cwd: '/',
          env: {},
          find: () => '/bin/atag',
          exec: vi.fn(),
          platform: 'linux',
          request: served(16384),
        })
      ).rejects.toMatchObject({
        code: 'ATC_USAGE',
        message:
          'Atomic Agent needs a context window of at least 32,768 tokens; model is served with 16,384.',
      })
      expect(await readdir(folder)).toEqual([])
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })
  it('runs a Windows npm shim through cmd.exe, its version probe included', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'atc-shim-'))
    const exec = vi.fn(async () => ({ code: 0, stdout: '1.15.0', stderr: '', timedOut: false }))
    try {
      const launch = await prepareAgent('opencode', 'http://localhost:1/v1', 'model', 'key', {
        folder,
        cwd: 'C:\\work',
        env: {},
        find: () => 'C:\\npm\\opencode.cmd',
        exec,
        platform: 'win32',
        request: noWindow,
      })
      expect(exec).toHaveBeenCalledWith(
        'cmd.exe',
        ['/d', '/s', '/c', '"C:\\npm\\opencode.cmd --version"'],
        expect.objectContaining({ windowsVerbatimArguments: true })
      )
      expect(launch).toMatchObject({ command: 'cmd.exe', windowsVerbatimArguments: true })
      expect(launch.args.slice(0, 3)).toEqual(['/d', '/s', '/c'])
      expect(launch.args[3]).toBe('"C:\\npm\\opencode.cmd --model atomic-chat/model"')
    } finally {
      await rm(folder, { recursive: true, force: true })
    }
  })
})
