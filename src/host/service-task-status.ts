/** Task Scheduler status through its numeric API, independent of the Windows display language. */
import { AtcError } from '../errors/index.js'
import type { ExecResult } from './exec.js'
import type { ServiceEnv, ServiceState } from './service-manager.js'

export function taskStatusProbe(
  name: string,
  env: Pick<ServiceEnv, 'windowsPowerShell'>
): { command: string; args: string[] } {
  const script = [
    "$ErrorActionPreference = 'Stop';",
    'try {',
    "$scheduler = New-Object -ComObject 'Schedule.Service';",
    '$scheduler.Connect();',
    "$folder = $scheduler.GetFolder('\\');",
    'try {',
    `$task = $folder.GetTask('${name.replace(/'/g, "''")}');`,
    '} catch {',
    '$failure = $_.Exception;',
    'while ($null -ne $failure.InnerException) { $failure = $failure.InnerException; }',
    // Only GetTask's ERROR_FILE_NOT_FOUND proves absence; connection/folder errors must fail.
    "if ($failure.HResult -eq -2147024894) { [Console]::Out.WriteLine('missing'); exit 0; }",
    'throw;',
    '}',
    '[Console]::Out.WriteLine([int]$task.State);',
    'exit 0;',
    '} catch { [Console]::Error.WriteLine($_.Exception.ToString()); exit 1; }',
  ].join(' ')
  return {
    command: env.windowsPowerShell ?? 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    args: [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64'),
    ],
  }
}

export function readTaskStatus(result: ExecResult): Pick<ServiceState, 'installed' | 'running'> {
  const output = result.stdout.trim()
  if (!result.error && !result.timedOut && result.code === 0) {
    if (output === 'missing') return { installed: false, running: false }
    // TASK_STATE: unknown=0, disabled=1, queued=2, ready=3, running=4.
    if (/^[0-4]$/.test(output)) return { installed: true, running: output === '0' ? null : output === '4' }
  }
  throw new AtcError('ATC_SERVICE_FAILED', 'Could not query the Windows scheduled task.', {
    details:
      result.error ||
      (result.timedOut ? 'The status query timed out.' : result.stderr.trim()) ||
      (result.code === 0 ? 'The status query returned an invalid response.' : `exit code ${result.code}`),
  })
}
