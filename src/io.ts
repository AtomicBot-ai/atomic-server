/**
 * Everything a command touches outside its own logic, in one injectable object (the core's `CliIo`
 * shape plus what a server CLI needs: TTY facts and a line-reading prompt). Tests run commands with
 * `recordingIo()` and read what they printed; nothing in `src/` calls `process.stdout` directly.
 */

import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { openInBrowser, processHandlersFor } from '@atomic-chat/core/host'
import type { ErrorSink } from '@atomic-chat/core/host'

export interface TtyFacts {
  stdin: boolean
  stdout: boolean
  stderr: boolean
}

/** The real terminal, for a full-screen UI that needs the streams themselves (raw mode, resize). */
export interface TerminalStreams {
  stdin: NodeJS.ReadStream
  stdout: NodeJS.WriteStream
  stderr: NodeJS.WriteStream
}

export interface AtcIo {
  /** Line-delimited machine protocol input; absent in tests unless supplied. */
  inputLines?: () => AsyncIterable<string>
  stdout: (text: string) => void
  stderr: (text: string) => void
  env: NodeJS.ProcessEnv
  cwd: string
  isTTY: TtyFacts
  /** Terminal width for tables and progress bars; 80 when unknown. */
  columns: number
  fetch: typeof fetch
  readFile: (path: string) => Promise<string | undefined>
  /** Ask one line on the terminal; `secret` hides the echo. Only the real terminal can answer. */
  question: (prompt: string, options?: { secret?: boolean }) => Promise<string>
  /** Block until the process is asked to stop, then run `onStop`. A test resolves it itself. */
  waitForShutdown: (onStop: () => Promise<void>) => Promise<void>
  /** Open a URL in the user's browser; best effort, the URL is always printed as well. */
  openUrl: (url: string) => Promise<void>
  /** Present only when stdin and stdout are both a terminal: what `atc tui` renders on. */
  terminal?: TerminalStreams
  /**
   * Run `handler` on Ctrl-C instead of exiting, until the returned function is called: for a command
   * that only follows work the server does, so it can say how to follow again. Absent: Ctrl-C exits.
   */
  onInterrupt?: (handler: () => void) => () => void
  /** Resolve once stdout and stderr have handed everything written to the OS; before `process.exit`. */
  flush?: () => Promise<void>
  /**
   * For a process that is the server: a throw nothing caught is said on stderr, reported (up to 2 s)
   * and ends the process with 1, as it would without handlers. Absent in tests.
   */
  catchFatal?: (reporter: ErrorSink & { flush(timeoutMs?: number): Promise<void> }) => void
}

export function nodeIo(): AtcIo {
  const interactive = Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY)
  // A write a pipe could not take at once: the Bun binary's `process.exit` drops it unless 'drain' came.
  const waiting = new Map<NodeJS.WriteStream, Promise<void>>()
  const write = (stream: NodeJS.WriteStream) => (text: string) => {
    if (stream.write(text) || waiting.has(stream)) return
    waiting.set(
      stream,
      new Promise<void>((resolve) =>
        stream.once('drain', () => {
          waiting.delete(stream)
          resolve()
        })
      )
    )
  }
  return {
    ...(interactive
      ? { terminal: { stdin: process.stdin, stdout: process.stdout, stderr: process.stderr } }
      : {}),
    inputLines: () => createInterface({ input: process.stdin, crlfDelay: Infinity }),
    stdout: write(process.stdout),
    stderr: write(process.stderr),
    flush: async () => {
      while (waiting.size) await Promise.all(waiting.values())
    },
    env: process.env,
    cwd: process.cwd(),
    isTTY: {
      stdin: Boolean(process.stdin.isTTY),
      stdout: Boolean(process.stdout.isTTY),
      stderr: Boolean(process.stderr.isTTY),
    },
    columns: process.stdout.columns || process.stderr.columns || 80,
    fetch: (...args) => fetch(...args),
    readFile: (path) =>
      readFile(path, 'utf8').then(
        (t) => t,
        () => undefined
      ),
    question: (prompt, options) => askOnTerminal(prompt, options?.secret === true),
    openUrl: (url) => openInBrowser(url),
    catchFatal: (reporter) =>
      processHandlersFor(
        process,
        (text) => process.stderr.write(text),
        (code) => process.exit(code)
      )({ reporter }),
    onInterrupt: (handler) => {
      process.once('SIGINT', handler)
      return () => process.off('SIGINT', handler)
    },
    waitForShutdown: (onStop) =>
      new Promise<void>((resolve) => {
        const stop = () => {
          process.off('SIGINT', stop)
          process.off('SIGTERM', stop)
          void onStop().finally(resolve)
        }
        process.on('SIGINT', stop)
        process.on('SIGTERM', stop)
        // A daemon whose stdin closes has no foreground client left, but that is not a reason to
        // stop: ownership is explicit. Only signals stop us.
      }),
  }
}

/** The prompt goes to stderr so stdout stays parseable; a secret answer is not echoed. */
async function askOnTerminal(prompt: string, secret: boolean): Promise<string> {
  process.stderr.write(prompt)
  const muted = new Writable({ write: (_chunk, _enc, cb) => cb() })
  const rl = createInterface({
    input: process.stdin,
    output: secret ? muted : process.stderr,
    terminal: secret ? true : Boolean(process.stdin.isTTY),
  })
  try {
    const answer = await rl.question('')
    if (secret) process.stderr.write('\n')
    return answer
  } finally {
    rl.close()
  }
}

export interface RecordingIo extends AtcIo {
  out: string[]
  err: string[]
  /** Scripted answers for `question`, consumed in order; an exhausted script answers ''. */
  answers: string[]
}

/** Collects output instead of writing it; the tests' view of a command run. Non-interactive. */
export function recordingIo(over: Partial<AtcIo> & { answers?: string[] } = {}): RecordingIo {
  const out: string[] = []
  const err: string[] = []
  const answers = [...(over.answers ?? [])]
  const { answers: _ignored, ...rest } = over
  return {
    out,
    err,
    answers,
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    env: {},
    cwd: process.cwd(),
    isTTY: { stdin: false, stdout: false, stderr: false },
    columns: 80,
    fetch: (...args) => fetch(...args),
    readFile: (path) =>
      readFile(path, 'utf8').then(
        (t) => t,
        () => undefined
      ),
    question: async () => answers.shift() ?? '',
    openUrl: async () => {},
    waitForShutdown: async (onStop) => {
      await onStop()
    },
    ...rest,
  }
}
