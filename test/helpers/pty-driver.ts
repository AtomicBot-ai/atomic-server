/**
 * The terminal UI in a real pseudo-terminal (Python's `pty`, POSIX): a driver that types keys, clicks a label
 * on the current screen (an SGR mouse press where it is drawn), waits for text and resizes, then reports the
 * exit code and everything the program wrote.
 */
import { spawnSync } from 'node:child_process'

export const DRIVER = String.raw`
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
def frame():
    # Ink writes each frame whole, right after erasing the last one: the screen is what follows that erase.
    i = out.rfind(b'\x1b[2K')
    j = out.find(b'\x1b[G', i) if i >= 0 else -1
    k = out.rfind(b'\x1b[?1049h')
    start = j + 3 if j >= 0 else (i + 4 if i >= 0 else (k + 8 if k >= 0 else 0))
    return ansi.sub(b'', out[start:]).decode('utf8', 'replace').split('\n')
def click(label):
    # A read can end inside a frame's write: look again on fresher output for a few seconds.
    end = time.time() + 3
    while True:
        lines = frame()
        for y in range(len(lines) - 1, -1, -1):
            x = lines[y].rfind(label)
            if x >= 0:
                os.write(fd, ('\x1b[<0;%d;%dM' % (x + 1, y + 1)).encode())
                return True
        if time.time() > end: return False
        pump(seconds=0.1)
ok = True
failed = []
checkpoint = 0
for step in steps:
    if 'wait' in step:
        seen = pump(step['wait'], since=checkpoint if step.get('fresh') else 0)
        if not seen: failed.append(step['wait'])
        ok = seen and ok
    elif 'click' in step:
        checkpoint = len(out)
        if not click(step['click']):
            failed.append('click ' + step['click']); ok = False
        pump(seconds=0.4)
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

/** The driver needs Python with `pty` (POSIX). */
export const hasPython = () => spawnSync('python3', ['-c', 'import pty']).status === 0

export type PtyStep =
  | { wait: string; fresh?: boolean }
  | { type: string }
  | { click: string }
  | { resize: [rows: number, cols: number] }

export interface PtyResult {
  ok: boolean
  failed: string[]
  code: number | null
  out: string
}

/** Runs `command` in a 100x30 pseudo-terminal through `steps`. */
export function runPty(
  steps: PtyStep[],
  command: string[],
  env: NodeJS.ProcessEnv,
  timeout = 90_000
): PtyResult {
  const res = spawnSync('python3', ['-c', DRIVER, JSON.stringify(steps), ...command], {
    encoding: 'utf8',
    env: { TERM: 'xterm-256color', NO_COLOR: '1', ...env },
    timeout,
  })
  if (res.status !== 0) throw new Error(`pty driver: ${res.stderr}`)
  return JSON.parse(res.stdout.trim().split('\n').at(-1) as string) as PtyResult
}
