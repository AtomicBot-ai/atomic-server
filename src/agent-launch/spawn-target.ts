/**
 * What to spawn for an agent launcher. On Windows an npm-installed agent is a `.cmd` shim
 * (`claude.cmd`, `codex.cmd`): Node refuses to spawn a batch file without a shell (EINVAL), so a shim
 * runs through `cmd.exe /d /s /c "<line>"` with each token quoted for cmd, and `/s` makes cmd strip
 * exactly the outer quotes. An `.exe`, and every other platform, spawns directly. The same rule as the
 * core's `atomic-chat launch` (atomic-chat-core `src/cli/launch.ts`).
 */
export interface SpawnTarget {
  file: string
  args: string[]
  /** Hand `args` to the process as written: the cmd.exe line is quoted for cmd, not for MSVC. */
  windowsVerbatimArguments: boolean
}

/** A token as cmd.exe and the MSVC argument parser both read it back. `%VAR%` still expands. */
function quoteForCmd(token: string): string {
  if (/^[\w\-.:\\/=@+,]+$/.test(token)) return token
  return `"${token.replace(/"/g, '""')}"`
}

export function spawnTarget(program: string, args: string[], platform: NodeJS.Platform): SpawnTarget {
  if (platform !== 'win32' || !/\.(cmd|bat)$/i.test(program))
    return { file: program, args, windowsVerbatimArguments: false }
  const line = [program, ...args].map(quoteForCmd).join(' ')
  return { file: 'cmd.exe', args: ['/d', '/s', '/c', `"${line}"`], windowsVerbatimArguments: true }
}
