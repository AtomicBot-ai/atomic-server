import { describe, expect, it } from 'vitest'
import { execCommand, findOnPath, killTimedOut } from './exec.js'

describe('execCommand', () => {
  it('captures output and exit code without a shell', async () => {
    const result = await execCommand(process.execPath, ['-e', 'process.stdout.write("hi"); process.exit(3)'])
    expect(result).toMatchObject({ code: 3, stdout: 'hi', timedOut: false })
  })

  it('reports a missing program as code null with the error', async () => {
    const result = await execCommand('atc-no-such-program-xyz', [])
    expect(result.code).toBeNull()
    expect(result.error).toMatch(/ENOENT/)
  })

  it('kills a hung program at the timeout and caps output', async () => {
    const hung = await execCommand(process.execPath, ['-e', 'setTimeout(()=>{}, 10000)'], { timeoutMs: 200 })
    expect(hung.timedOut).toBe(true)
    expect(hung.code).toBeNull()
    const big = await execCommand(process.execPath, ['-e', 'process.stdout.write("x".repeat(5000))'], {
      maxOutputBytes: 100,
    })
    expect(big.stdout.length).toBe(100)
  })
})

describe('findOnPath', () => {
  it('walks PATH with platform rules', () => {
    const exists = (p: string) => p === '/usr/bin/sudo' || p === 'C:\\tools\\nvidia-smi.exe'
    expect(findOnPath('sudo', { PATH: '/bin:/usr/bin' }, 'linux', exists)).toBe('/usr/bin/sudo')
    expect(findOnPath('pkexec', { PATH: '/bin:/usr/bin' }, 'linux', exists)).toBeUndefined()
    expect(findOnPath('nvidia-smi', { Path: 'C:\\tools', PATHEXT: '.EXE;.CMD' }, 'win32', exists)).toBe(
      'C:\\tools\\nvidia-smi.exe'
    )
  })
})

describe('killTimedOut', () => {
  it('asks taskkill to end the tree on Windows', async () => {

    const calls: string[][] = []
    await killTimedOut(
      42,
      'win32',
      async (command, args) => {
        calls.push([command, ...args])
        return { code: 0, stdout: '', stderr: '', timedOut: false }
      },
      false
    )
    expect(calls).toEqual([['taskkill', '/PID', '42', '/T', '/F']])
  })

  // Posix detached children are process-group leaders: the timeout kills -pid, not only the child.
  it('kills the process group on posix when the child was detached', async () => {
    const killed: Array<[number, NodeJS.Signals | undefined]> = []
    const original = process.kill
    process.kill = ((pid: number, signal?: NodeJS.Signals) => {
      killed.push([pid, signal])
      return true
    }) as typeof process.kill
    try {
      await killTimedOut(42, 'linux', async () => ({ code: 0, stdout: '', stderr: '', timedOut: false }), true)
    } finally {
      process.kill = original
    }
    expect(killed).toEqual([[-42, 'SIGKILL']])
  })
})
