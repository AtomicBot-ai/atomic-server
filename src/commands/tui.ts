/**
 * `atc tui`, and bare `atc` on an interactive terminal (`opensTui`): the full-screen terminal UI.
 * The UI itself is loaded only here, so no other command pays for React and Ink at start-up.
 */

import { join } from 'node:path'
import { adminLoginUrl, ensureAdminToken } from '../admin/index.js'
import { AtcError, defineCommand } from '../cli/index.js'
import { readTextFile, resolveConfig } from '../config/index.js'
import { CHECKS, runChecks } from '../doctor/index.js'
import { HostStepJournal } from '../host/index.js'
import { colorEnabled } from '../output/index.js'
import { TELEMETRY_NOTICE, takeTelemetryNotice } from '../telemetry/index.js'

const SCREENS = [
  'chat',
  'server',
  'models',
  'welcome',
  'settings',
  'requests',
  'access',
  'checks',
  'overview',
  'logs',
  'config',
  'doctor',
  'commands',
] as const
type Screen = (typeof SCREENS)[number]

export const tuiCommand = defineCommand({
  name: 'tui',
  summary: 'Full-screen terminal UI over the server (what bare `atc` opens on a terminal)',
  description:
    'A keyboard-first workspace for chat and API hosting, with mouse navigation, model selection, request activity, settings, logs, and system checks. Choose Personal terminal or Server console on first launch. Ctrl+G opens navigation; Ctrl+K shows shortcuts; Ctrl+Q leaves the console without stopping the server. Bare `atc` opens it on an interactive terminal.',
  group: 'access',
  options: {
    screen: {
      type: 'string',
      description: 'Open on chat, server, models, welcome, logs, config, doctor, or commands',
      placeholder: 'name',
    },
  },
  examples: ['atc', 'atc tui --screen logs'],
  run: async (inv, ctx) => {
    const screen = inv.values['screen'] as string | undefined
    if (screen && !SCREENS.includes(screen as Screen))
      throw new AtcError('ATC_USAGE', `Unknown screen '${screen}'.`, { hint: `one of ${SCREENS.join(', ')}` })
    const terminal = ctx.io.terminal
    if (!terminal || ctx.flags.json)
      throw new AtcError('ATC_USAGE', 'The terminal UI needs an interactive terminal.', {
        hint: 'in scripts use `atc status --json`; for a browser, `atc admin`',
      })
    const { paths, io } = ctx
    const loadConfig = async () =>
      resolveConfig({ fileText: await readTextFile(paths.configFile), env: io.env })
    const { runTui } = await import('../tui/index.js')
    const notice = await takeTelemetryNotice({ config: await ctx.config(), paths, env: io.env })
    return runTui({
      terminal,
      ...(notice ? { notice: TELEMETRY_NOTICE } : {}),
      agentHost: {
        env: io.env,
        cwd: io.cwd,
        folder: join(paths.dataFolder, 'atc', 'agents'),
        find: ctx.host.findOnPath,
        exec: ctx.host.exec,
      },
      screen: screen as Screen | undefined,
      request: io.fetch,
      apiKey: io.env['ATC_API_KEY'] ?? '',
      chatKey: io.env['ATC_CHAT_API_KEY'] ?? io.env['ATC_API_KEY'] ?? '',
      trueColor: /truecolor|24bit/i.test(io.env['COLORTERM'] ?? ''),
      color: colorEnabled({ isTTY: io.isTTY.stdout, env: io.env, noColor: ctx.flags.noColor }),
      dataFolder: paths.dataFolder,
      waitForShutdown: io.waitForShutdown,
      root: ctx.root,
      deps: {
        paths,
        attach: (options) => ctx.core.attach(options),
        loadConfig,
        runDoctor: async () => {
          const config = await loadConfig()
          return runChecks(CHECKS, {
            paths,
            host: ctx.host,
            env: io.env,
            apiPort: config.values.api.port,
            adminPort: config.values.admin.port,
          })
        },
        pendingHostSteps: async () =>
          (await new HostStepJournal(paths.hostStepsJournal).load())
            .filter((e) => e.state === 'pending-manual')
            .map((e) => ({
              step_id: e.step_id,
              instructions: e.instructions ?? '',
              updated_at: e.updated_at,
            })),
        loginUrl: async (adminUrl) => adminLoginUrl(adminUrl, await ensureAdminToken(paths.adminToken)),
        openUrl: io.openUrl,
        now: ctx.now,
      },
    })
  },
})
