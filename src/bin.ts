#!/usr/bin/env node
/** The process entry: real I/O, the real daemon spawner, and an exit code. Nothing else lives here. */
import { selfCommand } from '@atomic-chat/core/host'
import { spawnDaemon } from './daemon/index.js'
import { nodeIo } from './io.js'
import { runCli } from './main.js'

const io = nodeIo()
runCli(process.argv.slice(2), io, {
  spawnDaemon: (paths, log, args) => spawnDaemon({ paths, selfCommand: selfCommand(), log, args }),
}).then(
  (code) => process.exit(code),
  (error: unknown) => {
    io.stderr(`atc crashed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`)
    process.exit(1)
  }
)
