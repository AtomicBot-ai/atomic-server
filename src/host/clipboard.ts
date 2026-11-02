import type { ExecFn } from './exec.js'

/** Copy on the terminal's machine. SSH must address the user's terminal through OSC 52 instead. */
export async function copyToClipboard(
  text: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  exec: ExecFn
): Promise<boolean> {
  if (env['SSH_CONNECTION'] || env['SSH_TTY'] || env['SSH_CLIENT']) return false
  const commands: [string, string[]][] =
    platform === 'darwin'
      ? [['/usr/bin/pbcopy', []]]
      : platform === 'win32'
        ? [
            [
              'powershell.exe',
              [
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                '[Console]::InputEncoding = [System.Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())',
              ],
            ],
          ]
        : [
            ...(env['WAYLAND_DISPLAY'] ? [['wl-copy', []] as [string, string[]]] : []),
            ...(env['DISPLAY']
              ? ([
                  ['xclip', ['-selection', 'clipboard']],
                  ['xsel', ['--clipboard', '--input']],
                ] as [string, string[]][])
              : []),
          ]
  if (!commands.length) return false
  for (const [command, args] of commands) {
    const result = await exec(command, args, { input: text, env, timeoutMs: 3000, maxOutputBytes: 1024 })
    if (result.code === 0 && !result.timedOut) return true
  }
  throw new Error('Could not copy. Select the command and copy it manually.')
}
