import { describe, expect, it } from 'vitest'
import { recordingIo } from './io.js'
import { runCli } from './main.js'
import { ATC_VERSION } from './version.js'

describe('runCli', () => {
  it('prints the version and help', async () => {
    const io = recordingIo()
    expect(await runCli(['--version'], io)).toBe(0)
    expect(io.out).toEqual([`${ATC_VERSION}\n`])
    const help = recordingIo()
    expect(await runCli([], help)).toBe(2)
    expect(help.out.join('')).toContain('Usage: atc <command>')
    const sub = recordingIo()
    expect(await runCli(['models', 'pull', '--help'], sub)).toBe(0)
    expect(sub.out.join('')).toContain('Usage: atc models pull <model>')
  })

  it('reports unknown commands and malformed operation input as JSON', async () => {
    const bad = recordingIo()
    expect(await runCli(['bogus'], bad)).toBe(2)
    expect(bad.err.join('')).toContain('Unexpected argument: bogus')
    const stub = recordingIo()
    expect(await runCli(['control', 'call', 'api.ping', '--input', '[]', '--json'], stub)).toBe(2)
    expect(JSON.parse(stub.err.join(''))).toMatchObject({ error: { code: 'ATC_USAGE' } })
    expect(stub.out).toEqual([])
  })

  it('runs version as JSON', async () => {
    const io = recordingIo()
    expect(await runCli(['version', '--json'], io)).toBe(0)
    expect(JSON.parse(io.out.join(''))).toMatchObject({ atc: ATC_VERSION })
  })
})
