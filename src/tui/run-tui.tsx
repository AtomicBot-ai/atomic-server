/** The console owns the terminal only while visible. Agent handoff happens after cleanup. */
import { render } from 'ink'
import type { CommandSpec } from '../cli/index.js'
import { EXIT } from '../errors/index.js'
import type { AtcIo, TerminalStreams } from '../io.js'
import type { AgentHost, AgentLaunch } from '../agent-launch/index.js'
import { runAgent } from '../agent-launch/index.js'
import { WorkspaceApp } from './workspace/index.js'
import type { Page } from './workspace/index.js'
import type { WorkspaceState } from './workspace/state.js'
import { oneLine } from './controller.js'
import type { TuiDeps } from './controller.js'
import type { TabId } from './state.js'
export interface RunTuiOptions {
  authorizeHostStep?: (operation: string) => Promise<void>
  terminal: TerminalStreams
  deps: TuiDeps
  screen: TabId | Page | undefined
  request?: typeof fetch
  apiKey?: string
  chatKey?: string
  trueColor?: boolean
  color: boolean
  dataFolder: string
  waitForShutdown: AtcIo['waitForShutdown']
  root: CommandSpec
  agentHost?: AgentHost
  launchAgent?: (launch: AgentLaunch) => Promise<void>
  /** Shown in the status line when the screen first opens (the one-time telemetry notice). */
  notice?: string
}
export async function runTui(options: RunTuiOptions): Promise<number> {
  const { terminal, deps } = options
  const workspaceDeps = {
    base: deps,
    request: options.request ?? fetch,
    apiKey: options.apiKey ?? '',
    chatKey: options.chatKey ?? options.apiKey ?? '',
    ...(options.agentHost ? { agentHost: options.agentHost } : {}),
  }
  let page =
    options.screen === 'overview'
      ? 'server'
      : options.screen === 'config'
        ? 'settings'
        : options.screen === 'doctor'
          ? 'checks'
          : options.screen
  let instance: ReturnType<typeof render> | undefined,
    signalled = false,
    showIntro = true,
    message = options.notice ?? ''
  let resume: WorkspaceState | undefined
  void options.waitForShutdown(async () => {
    signalled = true
    instance?.unmount()
  })
  while (!signalled) {
    let handoff: AgentLaunch | undefined
    let hostStep: string | undefined
    const write = (value: string) => {
      terminal.stdout.write(value)
    }
    instance = render(
      <WorkspaceApp
        {...(resume ? { initialState: resume } : {})}
        onHostStep={(operation, state) => {
          hostStep = operation
          resume = state
        }}
        showIntro={showIntro}
        deps={workspaceDeps}
        root={options.root}
        {...(page ? { initialPage: page as Page } : {})}
        initialMessage={message}
        color={options.color}
        trueColor={options.trueColor ?? false}
        write={write}
        onLaunch={(launch) => {
          handoff = launch
        }}
      />,
      {
        stdin: terminal.stdin,
        stdout: terminal.stdout,
        stderr: terminal.stderr,
        exitOnCtrlC: false,
        alternateScreen: true,
        interactive: true,
        kittyKeyboard: { mode: 'auto', flags: ['disambiguateEscapeCodes'] },
      }
    )
    try {
      await instance.waitUntilExit()
    } finally {
      terminal.stdout.write('\u001b[?1000l\u001b[?1003l\u001b[?1006l')
    }
    if (signalled) break
    if (hostStep) {
      showIntro = false
      try {
        if (!options.authorizeHostStep) throw new Error('Host authorization is unavailable in this terminal.')
        await options.authorizeHostStep(hostStep)
      } catch (error) {
        if (resume) resume = { ...resume, message: oneLine(error) }
      }
      continue
    }
    if (!handoff) break
    resume = undefined
    showIntro = false
    try {
      await (options.launchAgent ?? runAgent)(handoff)
      message = 'Back in Server. The API is still running.'
    } catch (error) {
      message = oneLine(error)
    }
    page = 'server'
  }
  return signalled ? EXIT.INTERRUPTED : EXIT.OK
}
