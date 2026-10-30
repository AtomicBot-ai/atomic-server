import { describe, expect, it } from 'vitest'
import type { ExecResult } from './exec.js'
import { readTaskStatus, taskStatusProbe } from './service-task-status.js'

const result = (over: Partial<ExecResult>): ExecResult => ({
  code: 0,
  stdout: '',
  stderr: '',
  timedOut: false,
  ...over,
})

describe('Windows task status', () => {
  it.each([
    ['missing', false, false],
    ['0', true, null],
    ['1', true, false],
    ['2', true, false],
    ['3', true, false],
    ['4', true, true],
  ])('reads %s as installed=%s, running=%s', (stdout, installed, running) => {
    expect(readTaskStatus(result({ stdout: `${stdout}\r\n` }))).toEqual({ installed, running })
  })

  it.each([
    [result({ code: 1, stderr: 'Access is denied. (0x80070005)' }), 'Access is denied. (0x80070005)'],
    [result({ code: null, error: 'ENOENT' }), 'ENOENT'],
    [result({ code: null, timedOut: true }), 'The status query timed out.'],
    [result({ code: 1, stdout: 'missing' }), 'exit code 1'],
    [result({ code: 0, stdout: 'missing', timedOut: true }), 'The status query timed out.'],
    [result({ stdout: '' }), 'The status query returned an invalid response.'],
    [result({ stdout: '5' }), 'The status query returned an invalid response.'],
    [result({ stdout: '4\nmissing' }), 'The status query returned an invalid response.'],
  ])('keeps failed and malformed queries operational: %j', (response, details) => {
    expect(() => readTaskStatus(response)).toThrow(
      expect.objectContaining({ code: 'ATC_SERVICE_FAILED', details })
    )
  })

  it('uses the trusted PowerShell path and quotes the task name inside the encoded script', () => {
    const command = 'D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'
    const probe = taskStatusProbe("task's $name", { windowsPowerShell: command })
    expect(probe.command).toBe(command)
    expect(probe.args.slice(0, -1)).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand'])
    expect(Buffer.from(probe.args.at(-1)!, 'base64').toString('utf16le')).toContain(
      "$folder.GetTask('task''s $name')"
    )
  })
})
