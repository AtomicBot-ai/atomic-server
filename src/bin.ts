#!/usr/bin/env node
/** The process entry: real I/O, the real daemon spawner, and an exit code. Nothing else lives here. */
import { selfCommand } from '@atomic-chat/core/host'
import { spawnDaemon } from './daemon/index.js'
import { exitAfterFlush, nodeIo } from './io.js'
import { runCli } from './main.js'

const crash = (write: (text: string) => void) => (error: unknown) => {
  write(`atc crashed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
  process.exit(1)
}

// The core starts its Foundry Local and LiteRT-LM hosts as `atc foundry-host …` and `atc litert-host …`
// (`foundryHostCommand`, `liteRtHostCommand`). Those modes are the core's own entries: they run before
// atc parses a command or builds its I/O, so a host's stdout carries protocol lines alone.
const hostMain: Record<string, () => Promise<(argv: string[]) => Promise<number>>> = {
  'foundry-host': () => import('@atomic-chat/core/foundry-host').then((m) => m.runFoundryHostMain),
  'litert-host': () =>
    import('@atomic-chat/core/litert-host').then((m) => (argv) => m.runLiteRtHostMain(argv)),
}
const host = hostMain[process.argv[2] ?? '']

if (host) {
  host()
    .then((run) => run(process.argv.slice(3)))
    .then(
      (code) => process.exit(code),
      crash((text) => process.stderr.write(text))
    )
} else {
  const io = nodeIo()
  runCli(process.argv.slice(2), io, {
    spawnDaemon: (paths, log, args) => spawnDaemon({ paths, selfCommand: selfCommand(), log, args }),
  })
    // A pipe may still hold part of the output: the Bun binary's exit drops it (a `--json` cut at 64 KiB).
    .then((code) => exitAfterFlush(code, io.flush, process), crash(io.stderr))
}
