/** The command tree. Order here is the order in `atc --help`. */

import { defineCommand } from '../cli/index.js'
import { connectCommand } from './access/connect.js'
import { setupCommand } from './server/setup.js'
import { controlCommand } from './server/control.js'
import { mcpCommand } from './server/mcp.js'
import { adminCommand } from './access/admin.js'
import { completionCommand } from './system/completion.js'
import { configCommand } from './system/config.js'
import { daemonCommand } from './server/daemon.js'
import { doctorCommand } from './system/doctor.js'
import { hostStepCommand } from './system/host-step.js'
import { restartCommand, startCommand, statusCommand, stopCommand } from './server/lifecycle.js'
import { logsCommand } from './server/logs.js'
import { apiCommand } from './access/api-commands.js'
import { enginesCommand, hardwareCommand } from './models/engine-commands.js'
import { modelsCommand, runCommand, unloadCommand } from './models/model-commands.js'
import { serviceCommand } from './system/service.js'
import { chatCommand } from './access/terminal.js'
import { tuiCommand } from './access/tui.js'
import { updateCommand } from './system/update.js'
import { versionCommand } from './system/version.js'

export const ROOT = defineCommand({
  name: 'atc',
  summary: 'Atomic Server',
  description:
    'Atomic Server keeps models on this machine and serves them over an OpenAI-compatible API; atc is its command. Install an engine, pull a model, run it — and manage it all from here, the terminal UI (bare `atc` on a terminal) or the local web admin.',
  subcommands: [
    controlCommand,
    setupCommand,
    connectCommand,
    mcpCommand,
    startCommand,
    stopCommand,
    restartCommand,
    statusCommand,
    logsCommand,
    runCommand,
    unloadCommand,
    modelsCommand,
    enginesCommand,
    hardwareCommand,
    apiCommand,
    adminCommand,
    tuiCommand,
    chatCommand,
    configCommand,
    doctorCommand,
    serviceCommand,
    updateCommand,
    versionCommand,
    completionCommand,
    daemonCommand,
    hostStepCommand,
  ],
})
