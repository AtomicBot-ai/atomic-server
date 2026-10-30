import { describe, expect, it } from 'vitest'
import {
  escapeXml,
  launchdPlist,
  scheduledTaskXml,
  servicePathFor,
  systemdUnit,
  systemdWord,
  windowsArg,
  windowsServiceScript,
} from './service-manager.js'
import type { ServiceOptions } from './service-manager.js'

const o: ServiceOptions = {
  name: 'atc',
  command: ['/usr/local/bin/atc'],
  dataFolder: '/srv/atc data',
  system: false,
  user: 'atc',
  logFile: '/srv/atc data/atc/logs/service.log',
}
const env = { windowsUser: 'HOST\\u' }

describe('systemd', () => {
  it('renders a user unit', () => {
    expect(systemdUnit(o)).toMatchInlineSnapshot(`
      "[Unit]
      Description=Atomic Chat server (atc)
      After=network-online.target
      Wants=network-online.target

      [Service]
      Type=simple
      ExecStart=/usr/local/bin/atc start --foreground --data-folder "/srv/atc data"
      Restart=on-failure
      RestartSec=5
      KillMode=mixed
      TimeoutStopSec=45

      [Install]
      WantedBy=default.target
      "
    `)
  })

  it('renders a system unit with User= and the multi-user target', () => {
    const unit = systemdUnit({ ...o, system: true })
    expect(unit).toContain('User=atc\n')
    expect(unit).toContain('WantedBy=multi-user.target')
  })

  it.each([
    ['/usr/bin/atc', '/usr/bin/atc'],
    ['/srv/my data', '"/srv/my data"'],
    ['50%', '50%%'],
    ['a"b\\c', '"a\\"b\\\\c"'],
  ])('quotes %s as %s', (word, out) => {
    expect(systemdWord(word)).toBe(out)
  })
})

describe('launchd', () => {
  it('renders a user agent that restarts only after a failure', () => {
    expect(launchdPlist(o)).toMatchInlineSnapshot(`
      "<?xml version="1.0" encoding="UTF-8"?>
      <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
      <plist version="1.0">
      <dict>
        <key>Label</key><string>ai.atomic.atc</string>
        <key>ProgramArguments</key>
        <array>
          <string>/usr/local/bin/atc</string>
          <string>start</string>
          <string>--foreground</string>
          <string>--data-folder</string>
          <string>/srv/atc data</string>
        </array>
        <key>RunAtLoad</key><true/>
        <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
        <key>ThrottleInterval</key><integer>5</integer>
        <key>StandardOutPath</key><string>/srv/atc data/atc/logs/service.log</string>
        <key>StandardErrorPath</key><string>/srv/atc data/atc/logs/service.log</string>
      </dict>
      </plist>
      "
    `)
  })

  it('runs a system daemon as the given user and escapes XML', () => {
    const plist = launchdPlist({ ...o, system: true, dataFolder: '/a&b' })
    expect(plist).toContain('<key>UserName</key><string>atc</string>')
    expect(plist).toContain('<string>/a&amp;b</string>')
  })
})

describe('Task Scheduler', () => {
  it('renders a logon task with no time limit and restarts on failure', () => {
    expect(scheduledTaskXml({ ...o, command: ['C:\\Program Files\\atc\\atc.exe'] }, env))
      .toMatchInlineSnapshot(`
        "<?xml version="1.0" encoding="UTF-16"?>
        <Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
          <RegistrationInfo><Description>Atomic Chat server (atc)</Description></RegistrationInfo>
          <Triggers>
            <LogonTrigger>
              <Enabled>true</Enabled>
              <UserId>HOST\\u</UserId>
            </LogonTrigger>
          </Triggers>
          <Principals>
            <Principal id="Author">
              <UserId>HOST\\u</UserId>
              <LogonType>InteractiveToken</LogonType>
              <RunLevel>LeastPrivilege</RunLevel>
            </Principal>
          </Principals>
          <Settings>
            <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
            <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
            <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
            <StartWhenAvailable>true</StartWhenAvailable>
            <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
            <RestartOnFailure><Interval>PT1M</Interval><Count>999</Count></RestartOnFailure>
          </Settings>
          <Actions Context="Author">
            <Exec>
              <Command>C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe</Command>
              <Arguments>-NoLogo -NoProfile -NonInteractive -Command &quot;$exitCode = 1; for ($attempt = 0; $attempt -le 999; $attempt++) { $child = [System.Diagnostics.Process]::new(); try { $child.StartInfo.FileName = &apos;C:\\Program Files\\atc\\atc.exe&apos;; $child.StartInfo.Arguments = &apos;start --foreground --data-folder \\&quot;/srv/atc data\\&quot;&apos;; $child.StartInfo.UseShellExecute = $false; $child.StartInfo.CreateNoWindow = $true; [void]$child.Start(); $child.WaitForExit(); $exitCode = $child.ExitCode; } catch { [Console]::Error.WriteLine($_.Exception.Message); $exitCode = 1; } finally { $child.Dispose(); } if ($exitCode -eq 0) { exit 0; } if ($attempt -lt 999) { [System.Threading.Thread]::Sleep(5000); } } exit 1;&quot;</Arguments>
            </Exec>
          </Actions>
        </Task>
        "
      `)
  })

  it('quotes native arguments and PowerShell literals independently for the supervisor', () => {
    const script = windowsServiceScript({
      ...o,
      command: ["C:\\O'Brien\\node.exe", "C:\\cli's app\\bin.js"],
      dataFolder: "D:\\User's data & models",
    })
    expect(script).toContain("$child.StartInfo.FileName = 'C:\\O''Brien\\node.exe';")
    expect(script).toContain(
      `$child.StartInfo.Arguments = '"C:\\cli''s app\\bin.js" start --foreground --data-folder "D:\\User''s data & models"';`
    )
    expect(script).toContain('$child.WaitForExit();')
    expect(script).toContain('if ($exitCode -eq 0) { exit 0; }')
    expect(script).toContain('[System.Threading.Thread]::Sleep(5000);')
  })

  it('uses the host Windows directory instead of searching PATH for the supervisor', () => {
    const xml = scheduledTaskXml(o, {
      ...env,
      windowsPowerShell: 'D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    })
    expect(xml).toContain('<Command>D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe</Command>')
  })

  it('renders a boot task as SYSTEM', () => {
    const xml = scheduledTaskXml({ ...o, system: true }, env)
    expect(xml).toContain('<BootTrigger>')
    expect(xml).toContain('<UserId>S-1-5-18</UserId>')
    expect(xml).not.toContain('LogonTrigger')
  })

  it.each([
    ['plain', 'plain'],
    ['C:\\a b\\', '"C:\\a b\\\\"'],
    ['say "hi"', '"say \\"hi\\""'],
    ['', '""'],
  ])('quotes the argument %s as %s', (arg, out) => {
    expect(windowsArg(arg)).toBe(out)
  })
})

describe('where each platform keeps the definition', () => {
  it.each([
    ['linux', false, '/home/u/.config/systemd/user/atc.service'],
    ['linux', true, '/etc/systemd/system/atc.service'],
    ['darwin', false, '/home/u/Library/LaunchAgents/ai.atomic.atc.plist'],
    ['darwin', true, '/Library/LaunchDaemons/ai.atomic.atc.plist'],
    ['win32', false, 'schtasks:atc'],
  ] as const)('%s system=%s → %s', (platform, system, path) => {
    expect(servicePathFor(platform, { name: 'atc', system }, '/home/u')).toBe(path)
  })

  it('escapes the five XML characters', () => {
    expect(escapeXml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;')
  })
})
