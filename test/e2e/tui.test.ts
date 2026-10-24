import { readyWorkspace } from '../helpers/ready-workspace.js'
/**
 * The terminal UI in the built program. Without a terminal it must refuse (every platform); in a
 * real pseudo-terminal — Python's `pty`, so no native addon is needed — bare `atc` must open the
 * screen, answer keys and give the terminal back. Windows has no `pty` module: the screen is
 * checked by hand there (docs/testing.md).
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ATC, runAtc } from '../helpers/binary.js'

const command = [...ATC]
const dataFolder = join(mkdtempSync(join(tmpdir(), 'atc-e2e-tui-')), 'data')

afterAll(() => {
  runAtc(['stop', '--data-folder', dataFolder])
  rmSync(join(dataFolder, '..'), { recursive: true, force: true })
})

/**
 * Run argv in a 100×30 pseudo-terminal; `steps` alternate "wait until the screen shows this" and
 * "type this". Prints a JSON line with the exit code and everything the program wrote.
 */
const DRIVER = String.raw`
import json, os, pty, re, select, struct, sys, time, fcntl, termios, signal
steps = json.loads(sys.argv[1]); argv = sys.argv[2:]
pid, fd = pty.fork()
if pid == 0:
    os.execvp(argv[0], argv)
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', 30, 100, 0, 0))
out = b''
ansi = re.compile(rb'\x1b\[[0-9;?]*[ -/]*[@-~]')
def pump(until=None, seconds=20.0, since=0):
    global out
    end = time.time() + seconds
    while time.time() < end:
        if until is not None and until.encode() in ansi.sub(b'', out[since:]): return True
        r, _, _ = select.select([fd], [], [], 0.05)
        if r:
            try: data = os.read(fd, 65536)
            except OSError: return False
            if not data: return False
            out += data
    return until is None
ok = True
failed = []
checkpoint = 0
for step in steps:
    if 'wait' in step:
        seen = pump(step['wait'], since=checkpoint if step.get('fresh') else 0)
        if not seen: failed.append(step['wait'])
        ok = seen and ok
    elif 'resize' in step:
        rows, cols = step['resize']
        fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
        os.kill(pid, signal.SIGWINCH)
        pump(seconds=0.3)
    else:
        checkpoint = len(out)
        try: os.write(fd, step['type'].encode())
        except OSError: ok = False
        # A pause as between two presses: Esc followed at once by a key reads as Alt+key.
        pump(seconds=0.3)
code = None
end = time.time() + 15
while time.time() < end:
    done, status = os.waitpid(pid, os.WNOHANG)
    if done:
        code = os.waitstatus_to_exitcode(status); break
    pump(seconds=0.1)
if code is None: os.kill(pid, 9)
print(json.dumps({'ok': ok, 'failed':failed, 'code': code, 'out': out.decode('utf8', 'replace')}))
`

function hasPython(): boolean {
  return spawnSync('python3', ['-c', 'import pty'], { encoding: 'utf8' }).status === 0
}

// eslint-disable-next-line no-control-regex
const strip = (s: string) => s.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')

describe(`atc tui (${command.join(' ')})`, () => {
  it('refuses without a terminal, and bare atc prints help there', () => {
    const [exe, ...prefix] = command
    const env = { ...process.env, NO_COLOR: '1' }
    const tui = spawnSync(exe as string, [...prefix, 'tui', '--data-folder', dataFolder], {
      encoding: 'utf8',
      env,
    })
    expect(tui.status).toBe(2)
    expect(tui.stderr).toContain('The terminal UI needs an interactive terminal.')
    const bare = spawnSync(exe as string, [...prefix, '--data-folder', dataFolder], { encoding: 'utf8', env })
    expect(bare.status).toBe(2)
    expect(bare.stdout).toContain('Usage: atc <command>')
  })

  it.skipIf(process.platform === 'win32' || !hasPython())(
    'returns from engine choice to the intro with Escape on a fresh command entry',
    () => {
      const steps = [
        { wait: 'Choose engine' },
        { type: '\r' },
        { wait: 'Choose your engine' },
        { type: '\u001b' },
        { wait: 'Choose engine', fresh: true },
        { type: '\r' },
        { wait: 'Choose your engine', fresh: true },
        { type: '\u0011' },
      ]
      const result = spawnSync(
        'python3',
        [
          '-c',
          DRIVER,
          JSON.stringify(steps),
          ...command,
          '--data-folder',
          join(dataFolder, '..', 'first-run'),
        ],
        {
          encoding: 'utf8',
          env: { ...process.env, TERM: 'xterm-256color', NO_COLOR: '1' },
          timeout: 60_000,
        }
      )
      expect(result.status, result.stderr).toBe(0)
      const session = JSON.parse(result.stdout.trim().split('\n').at(-1)!) as {
        ok: boolean
        code: number
        out: string
      }
      expect(session.ok, strip(session.out).slice(-2000)).toBe(true)
      expect(session.code).toBe(0)
      expect(strip(session.out)).not.toContain('Press any key')
    }
  )

  it.skipIf(process.platform === 'win32' || !hasPython())(
    'opens on bare atc in a pseudo-terminal, switches screens, and gives the terminal back',
    () => {
      readyWorkspace(dataFolder)
      expect(runAtc(['config', 'set', 'admin.port', '0', '--data-folder', dataFolder]).code).toBe(0)
      const cache = join(dataFolder, 'atc', 'cache')
      mkdirSync(cache, { recursive: true })
      writeFileSync(
        join(cache, 'workspace-staff-picks.json'),
        JSON.stringify({
          at: Date.now(),
          data: { picks: [{ model_name: 'fixture/tui', title: 'Fixture model', format: 'gguf' }] },
        })
      )
      const steps = [
        { wait: 'Agents & tools' },
        { resize: [24, 54] },
        { wait: 'Agents' },
        { resize: [36, 120] },
        { type: '\u001b2' },
        { wait: 'Fixture model' },
        { type: '\u001b' },
        { type: '\u001b[B' },
        { type: '\u001b[B' },
        { type: '\r' },
        { wait: 'OpenAI' },
        { type: '\r' },
        { wait: 'Connect OpenAI' },
        { type: '\r' },
        { wait: 'Paste your provider API key' },
        { type: '\u001b' },
        { type: '\u001b' },
        { type: '\u001b' },
        { type: '\u0007' },
        { type: 's' },
        { wait: 'General' },
        { type: '\u001b4' },
        { wait: 'How can I help you today?' },
        { type: '\u001b1' },
        { type: '\u000b' },
        { wait: 'Keyboard shortcuts' },
        { type: '\u001b' },
        { type: '\u0011' },
      ]
      const res = spawnSync(
        'python3',
        ['-c', DRIVER, JSON.stringify(steps), ...command, '--data-folder', dataFolder],
        {
          encoding: 'utf8',
          // A CI runner may say TERM=dumb or nothing; the screen needs a real terminal type.
          env: { ...process.env, TERM: 'xterm-256color', NO_COLOR: '1' },
          timeout: 90_000,
        }
      )
      expect(res.status, res.stderr).toBe(0)
      const result = JSON.parse(res.stdout.trim().split('\n').at(-1) as string) as {
        failed: string[]
        ok: boolean
        code: number | null
        out: string
      }
      const screen = strip(result.out)
      expect(result.ok, result.failed.join(', ') + '\n' + screen.slice(-2000)).toBe(true)
      expect(result.code, screen.slice(-2000)).toBe(0)
      expect(screen).toContain('ATOMIC SERVER')
      expect(result.out).toContain('\u001b[?1006l')
      expect(result.out).toContain('\u001b[?1049h')
      expect(result.out).toContain('\u001b[?1049l')
    }
  )
})
