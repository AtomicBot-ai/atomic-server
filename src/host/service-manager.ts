/**
 * Running the server as an OS service: what each service manager is given. A systemd unit and a
 * launchd job run `atc start --foreground`, which stops gracefully on SIGTERM; a Windows scheduled
 * task does the same at logon (or at boot as SYSTEM), with no time limit and restarts on failure.
 * All three restart the server only when it fails: `atc stop` exits 0, so the server stays stopped.
 * The plans that install them are in `service-plans.ts`; this file is the definitions themselves.
 */

export interface ServiceOptions {
  /** `atc` by default; a second data folder gets its own name. */
  name: string
  /** How to run atc: the binary, or node and the script when running from source. */
  command: readonly string[]
  dataFolder: string
  /** System-wide (root, `/etc/systemd/system`, `/Library/LaunchDaemons`, a SYSTEM task) rather than this user. */
  system: boolean
  /** The account a system-wide unit runs as (`User=`, `UserName`); a Windows system task runs as SYSTEM. */
  user: string
  /** Where launchd sends the process's own stdout and stderr (crash output before the logger is up). */
  logFile: string
}

/** Where the service runs and who it is for; supplied by the host, not by the person. */
export interface ServiceEnv {
  home: string
  /** The uid of the per-user launchd domain (`gui/<uid>`). */
  uid: number | null
  /** `DOMAIN\user` for a Windows logon trigger. */
  windowsUser: string
}

export interface ServiceState {
  installed: boolean
  /** Null when the manager could not say. */
  running: boolean | null
  /** The unit file, plist or task name. */
  definition: string
}

export interface ServiceManager {
  readonly kind: 'systemd' | 'launchd' | 'task'
  install(options: ServiceOptions): Promise<void>
  uninstall(options: ServiceOptions): Promise<void>
  status(options: ServiceOptions): Promise<ServiceState>
  start(options: ServiceOptions): Promise<void>
  stop(options: ServiceOptions): Promise<void>
  restart(options: ServiceOptions): Promise<void>
}

/** The arguments after the program: run the server in place for this data folder. */
export function serverArgs(o: Pick<ServiceOptions, 'dataFolder'>): string[] {
  return ['start', '--foreground', '--data-folder', o.dataFolder]
}

/** One systemd word: quoted when needed, `%` doubled (specifiers), `\` and `"` escaped. */
export function systemdWord(word: string): string {
  const escaped = word.replace(/%/g, '%%')
  if (/^[\w./:@+=,%-]+$/.test(escaped)) return escaped
  return `"${escaped.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function systemdUnit(o: ServiceOptions): string {
  const exec = [...o.command, ...serverArgs(o)].map(systemdWord).join(' ')
  return [
    '[Unit]',
    'Description=Atomic Chat server (atc)',
    'After=network-online.target',
    'Wants=network-online.target',
    '',
    '[Service]',
    'Type=simple',
    `ExecStart=${exec}`,
    // SIGTERM is a graceful stop (models unloaded, lock released); `atc stop` exits 0 and stays stopped.
    'Restart=on-failure',
    'RestartSec=5',
    'KillMode=mixed',
    'TimeoutStopSec=45',
    ...(o.system ? [`User=${o.user}`] : []),
    '',
    '[Install]',
    `WantedBy=${o.system ? 'multi-user.target' : 'default.target'}`,
    '',
  ].join('\n')
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export const launchdLabel = (name: string): string => `ai.atomic.${name}`

export function launchdPlist(o: ServiceOptions): string {
  const strings = [...o.command, ...serverArgs(o)].map((a) => `    <string>${escapeXml(a)}</string>`)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    `  <key>Label</key><string>${escapeXml(launchdLabel(o.name))}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    ...strings,
    '  </array>',
    ...(o.system ? [`  <key>UserName</key><string>${escapeXml(o.user)}</string>`] : []),
    '  <key>RunAtLoad</key><true/>',
    // Restart only after a failure: `atc stop` exits 0 and must not bring the server straight back.
    '  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>',
    '  <key>ThrottleInterval</key><integer>5</integer>',
    `  <key>StandardOutPath</key><string>${escapeXml(o.logFile)}</string>`,
    `  <key>StandardErrorPath</key><string>${escapeXml(o.logFile)}</string>`,
    '</dict>',
    '</plist>',
    '',
  ].join('\n')
}

/** One Windows command-line argument, quoted the way `CommandLineToArgvW` reads it back. */
export function windowsArg(arg: string): string {
  if (arg !== '' && !/[\s"]/.test(arg)) return arg
  return `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1')}"`
}

/**
 * A Task Scheduler definition (registered with `schtasks /Create /XML`). The XML route is the only
 * one that sets what a server needs: no 72-hour execution limit, a restart on failure, and starting
 * on battery. A per-user task runs at that user's logon; a system task runs at boot as SYSTEM.
 */
export function scheduledTaskXml(o: ServiceOptions, env: Pick<ServiceEnv, 'windowsUser'>): string {
  const [program = '', ...rest] = o.command
  const args = [...rest, ...serverArgs(o)].map(windowsArg).join(' ')
  const trigger = o.system
    ? ['    <BootTrigger><Enabled>true</Enabled></BootTrigger>']
    : [
        '    <LogonTrigger>',
        '      <Enabled>true</Enabled>',
        `      <UserId>${escapeXml(env.windowsUser)}</UserId>`,
        '    </LogonTrigger>',
      ]
  const principal = o.system
    ? ['      <UserId>S-1-5-18</UserId>', '      <RunLevel>HighestAvailable</RunLevel>']
    : [
        `      <UserId>${escapeXml(env.windowsUser)}</UserId>`,
        '      <LogonType>InteractiveToken</LogonType>',
        '      <RunLevel>LeastPrivilege</RunLevel>',
      ]
  return [
    '<?xml version="1.0" encoding="UTF-16"?>',
    '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">',
    '  <RegistrationInfo><Description>Atomic Chat server (atc)</Description></RegistrationInfo>',
    '  <Triggers>',
    ...trigger,
    '  </Triggers>',
    '  <Principals>',
    '    <Principal id="Author">',
    ...principal,
    '    </Principal>',
    '  </Principals>',
    '  <Settings>',
    '    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>',
    '    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>',
    '    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>',
    '    <StartWhenAvailable>true</StartWhenAvailable>',
    '    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>',
    '    <RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure>',
    '  </Settings>',
    '  <Actions Context="Author">',
    '    <Exec>',
    `      <Command>${escapeXml(program)}</Command>`,
    `      <Arguments>${escapeXml(args)}</Arguments>`,
    '    </Exec>',
    '  </Actions>',
    '</Task>',
    '',
  ].join('\r\n')
}

export function servicePathFor(
  platform: NodeJS.Platform,
  o: Pick<ServiceOptions, 'name' | 'system'>,
  home: string
): string {
  if (platform === 'linux')
    return o.system
      ? `/etc/systemd/system/${o.name}.service`
      : `${home}/.config/systemd/user/${o.name}.service`
  if (platform === 'darwin')
    return o.system
      ? `/Library/LaunchDaemons/${launchdLabel(o.name)}.plist`
      : `${home}/Library/LaunchAgents/${launchdLabel(o.name)}.plist`
  return `schtasks:${o.name}`
}
