/**
 * `atc mcp` on the built program, where this change closed a hole: a session with --allow-writes alone offered
 * the MCP connector tools, so an agent could save a stdio connector with any command and start it on the
 * server's host. Those tools now need --allow-exec as well, and a guessed name is refused.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ATC, runAtc } from '../helpers/binary.js'

const dataFolder = join(mkdtempSync(join(tmpdir(), 'atc-e2e-mcp-')), 'data')
afterAll(() => {
  // The permitted call in the last session starts a server for the data folder.
  runAtc(['--data-folder', dataFolder, 'stop', '--force', '--kill'])
  rmSync(join(dataFolder, '..'), { recursive: true, force: true })
})

/** One stdio session: initialize, list the tools, and try to call connectors_check. */
function session(...flags: string[]) {
  const line = (id: number, method: string, params = {}) =>
    JSON.stringify({ jsonrpc: '2.0', id, method, params })
  const input = [
    line(1, 'initialize', { protocolVersion: '2025-06-18' }),
    line(2, 'tools/list'),
    line(3, 'tools/call', { name: 'connectors_check', arguments: { id: 'planted' } }),
  ].join('\n')
  const [exe, ...rest] = [...ATC, '--data-folder', dataFolder, 'mcp', ...flags]
  const res = spawnSync(exe as string, rest, { input: input + '\n', encoding: 'utf8', timeout: 60_000 })
  const replies = res.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(
      (text) =>
        JSON.parse(text) as { id: number; result?: { tools?: { name: string }[] }; error?: { code: number } }
    )
  const byId = (id: number) => replies.find((reply) => reply.id === id)
  return {
    code: res.status,
    tools: (byId(2)?.result?.tools ?? []).map((tool) => tool.name),
    call: byId(3),
  }
}

describe(`atc mcp (${ATC.join(' ')})`, () => {
  it.each([
    ['read-only', []],
    ['--allow-writes', ['--allow-writes']],
    ['--allow-exec without writes', ['--allow-exec']],
  ])('keeps connector programs out of a %s session and refuses a guessed name', (_name, flags) => {
    const s = session(...flags)
    expect(s.code).toBe(0)
    expect(s.tools).toContain('api_ping')
    for (const tool of ['connectors_save', 'connectors_import', 'connectors_check', 'connectors_call'])
      expect(s.tools).not.toContain(tool)
    expect(s.call?.error?.code).toBe(-32602)
  })

  it('offers them with --allow-writes and --allow-exec', () => {
    const s = session('--allow-writes', '--allow-exec')
    expect(s.tools).toEqual(
      expect.arrayContaining(['connectors_save', 'connectors_check', 'connectors_call'])
    )
  })
})
