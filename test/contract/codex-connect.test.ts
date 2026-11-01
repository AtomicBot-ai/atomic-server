import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { AGENTS } from '../../src/agent-launch/index.js'
import { testRun, fakeHost, type TestRun } from '../helpers/test-context.js'
let t: TestRun
afterEach(() => t?.cleanup())
describe('Codex connection export', () => {
  it.each(AGENTS)('keeps missing $name local on interactive connect', async (agent) => {
    const capture = vi.fn()
    const exec = vi.fn(async () => {
      throw new Error('unexpected execution')
    })
    t = testRun({
      io: { isTTY: { stdin: true, stdout: true, stderr: true } },
      deps: {
        host: fakeHost({ findOnPath: () => undefined, exec }),
        errors: { capture, flush: async () => {}, follow: () => {} },
      },
    })
    t.link.snapshotValue.server.running = true
    t.link.snapshotValue.sessions = [
      { model_id: 'owner/coder', provider: 'llamacpp-upstream', state: 'ready' },
    ] as never
    expect(await t.run(['api', 'key', 'create', 'Missing agent test', '--json'])).toBe(0)
    const key = JSON.parse(t.io.out.join('')).result as { id: string; token: string }
    t.io.out.length = 0
    expect(await t.run(['connect', agent.id, '--model', 'owner/coder', '--key-id', key.id])).toBe(2)
    expect(t.io.err.join('')).toContain(`${agent.name} is not installed on PATH`)
    expect(t.io.err.join('')).toContain(agent.docs)
    expect(t.io.err.join('')).not.toContain(key.token)
    expect(t.io.out).toEqual([])
    expect(capture).not.toHaveBeenCalled()
    expect(exec).not.toHaveBeenCalled()
    expect(existsSync(join(t.io.env['ATC_DATA_FOLDER']!, 'atc', 'agents'))).toBe(false)
  })
  it.each([['/build/atc-preview'], ['/runtime/node', '/source/dist/bin.js']])(
    'exports a profile with the real launcher %s and chosen server',
    async (...selfCommand) => {
      t = testRun({ deps: { host: fakeHost({ selfCommand }) } })
      t.link.snapshotValue.server.running = true
      t.link.snapshotValue.sessions = [
        { model_id: 'owner/coder', provider: 'llamacpp-upstream', state: 'ready' },
      ] as never
      expect(await t.run(['api', 'key', 'create', 'Codex test', '--json'])).toBe(0)
      const key = JSON.parse(t.io.out.join('')).result as { id: string; token: string }
      t.io.out.length = 0
      expect(
        await t.run(['connect', 'codex', '--model', 'owner/coder', '--key-id', key.id, '--export', '--json'])
      ).toBe(0)
      const result = JSON.parse(t.io.out.join('')).result
      expect(result.profile.env).toEqual({ ATC_AGENT_API_KEY: key.token })
      expect(result.profile.args).toContain('model_provider="atomic_chat"')
      expect(result.launch_command).toContain(t.io.env['ATC_DATA_FOLDER'])
      expect(result.launch_command).toContain(`--key-id '${key.id}'`)
      expect(result.launch_command).not.toContain(key.token)
      expect(result.launch_command.startsWith(selfCommand.map((word) => `'${word}'`).join(' '))).toBe(true)
    }
  )
  it('rejects a profile for a model that is not loaded', async () => {
    t = testRun()
    t.link.snapshotValue.server.running = true
    await t.run(['api', 'key', 'create', 'Codex test', '--json'])
    t.io.out.length = 0
    expect(await t.run(['connect', 'codex', '--model', 'missing', '--export', '--json'])).toBe(2)
    expect(t.io.err.join('')).toContain('Load the selected chat model')
    expect(t.io.out).toEqual([])
  })
})
