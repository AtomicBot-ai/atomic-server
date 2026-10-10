/**
 * Global flags are accepted anywhere in argv and stripped before a command parses its own. Pure:
 * table-tested without a process.
 */

export interface GlobalFlags {
  json: boolean
  verbose: boolean
  quiet: boolean
  yes: boolean
  noColor: boolean
  help: boolean
  version: boolean
  dataFolder?: string
}

export const DEFAULT_GLOBAL_FLAGS: GlobalFlags = {
  json: false,
  verbose: false,
  quiet: false,
  yes: false,
  noColor: false,
  help: false,
  version: false,
}

export interface SplitResult {
  globals: GlobalFlags
  /** argv without the global flags; `--` and everything after it is passed through untouched. */
  rest: string[]
  error?: string
}

const BOOLEANS: Record<string, keyof GlobalFlags> = {
  '--json': 'json',
  '--verbose': 'verbose',
  '-v': 'verbose',
  '--quiet': 'quiet',
  '-q': 'quiet',
  '--yes': 'yes',
  '-y': 'yes',
  '--no-color': 'noColor',
  '--help': 'help',
  '-h': 'help',
  '--version': 'version',
}

export function splitGlobalFlags(argv: readonly string[]): SplitResult {
  const globals: GlobalFlags = { ...DEFAULT_GLOBAL_FLAGS }
  const rest: string[] = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] as string
    if (arg === '--') {
      rest.push(...argv.slice(i))
      break
    }
    const flag = BOOLEANS[arg]
    // `atc --version` prints the version; after a command `--version` is that command's
    // (`atc update --version 1.2.3`), as in git.
    if (flag === 'version' && rest.length > 0) {
      rest.push(arg)
      continue
    }
    if (flag !== undefined) {
      ;(globals as unknown as Record<string, boolean>)[flag] = true
      continue
    }
    if (arg === '--data-folder') {
      const value = argv[i + 1]
      if (value === undefined || value.startsWith('-'))
        return { globals, rest, error: '--data-folder needs a path' }
      globals.dataFolder = value
      i += 1
      continue
    }
    if (arg.startsWith('--data-folder=')) {
      const value = arg.slice('--data-folder='.length)
      if (value === '') return { globals, rest, error: '--data-folder needs a path' }
      globals.dataFolder = value
      continue
    }
    rest.push(arg)
  }
  return { globals, rest }
}

/** The global options as every command's help lists them. */
export const GLOBAL_OPTIONS_HELP: ReadonlyArray<[flag: string, description: string]> = [
  ['--json', 'Print the result as one JSON document (errors go to stderr as JSON)'],
  ['-v, --verbose', 'Debug-level logging on stderr'],
  ['-q, --quiet', 'Only errors on stderr; no progress'],
  ['-y, --yes', 'Answer yes to safe confirmations; required for elevation and deletion without a terminal'],
  ['--data-folder <path>', 'Data folder to work with (default: <system data>/atomic-chat-cli/data)'],
  ['--no-color', 'Disable ANSI colours (NO_COLOR is honoured too)'],
  ['-h, --help', 'Show help'],
  ['--version', 'Print the version'],
]
