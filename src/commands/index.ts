/** The command tree. Order here is the order in `atc --help`. */

import { defineCommand } from '../cli/index.js'
import { connectCommand } from './connect.js'
import { setupCommand } from './setup.js'
import { controlCommand } from './control.js'
import { mcpCommand } from './mcp.js'
import { adminCommand } from './admin.js'
import { completionCommand } from './completion.js'
import { configCommand } from './config.js'
import { daemonCommand } from './daemon.js'
import { doctorCommand } from './doctor.js'
import { hostStepCommand } from './host-step.js'
import { restartCommand, startCommand, statusCommand, stopCommand } from './lifecycle.js'
import { logsCommand } from './logs.js'
import { apiCommand } from './api-commands.js'
import { enginesCommand, hardwareCommand } from './engine-commands.js'
import { modelsCommand, runCommand, unloadCommand } from './model-commands.js'
import { serviceCommand } from './service.js'
import { chatCommand } from './terminal.js'
import { tuiCommand } from './tui.js'
import { updateCommand } from './update.js'
import { versionCommand } from './version.js'

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
