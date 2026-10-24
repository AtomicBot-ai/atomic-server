#!/usr/bin/env node
/** The process entry: real I/O, the real daemon spawner, and an exit code. Nothing else lives here. */
import { selfCommand } from '@atomic-chat/core/host'
import { spawnDaemon } from './daemon/index.js'
import { nodeIo } from './io.js'
import { runCli } from './main.js'

const crash = (write: (text: string) => void) => (error: unknown) => {
  write(`atc crashed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
  process.exit(1)
}

// The core starts native hosts through this executable (`atc foundry-host …`, `atc litert-host …`).
// Each mode enters the core before atc parses a command or builds its I/O, so the host's stdout carries
// protocol lines alone.
if (process.argv[2] === 'foundry-host') {
  import('@atomic-chat/core/foundry-host')
    .then(({ runFoundryHostMain }) => runFoundryHostMain(process.argv.slice(3)))
    .then(
      (code) => process.exit(code),
      crash((text) => process.stderr.write(text))
    )
} else if (process.argv[2] === 'litert-host') {
  import('@atomic-chat/core/litert-host')
    .then(({ runLiteRtHostMain }) => runLiteRtHostMain(process.argv.slice(3)))
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
    .then(async (code) => {
      await io.flush?.()
      process.exit(code)
    }, crash(io.stderr))
}
