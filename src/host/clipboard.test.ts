import { expect, it, vi } from 'vitest'
import { copyToClipboard } from './clipboard.js'
import type { ExecFn } from './exec.js'

const ok = { code: 0, stdout: '', stderr: '', timedOut: false }
it.each([
  ['darwin', {}, '/usr/bin/pbcopy'],
  ['win32', {}, 'powershell.exe'],
  ['linux', { WAYLAND_DISPLAY: 'wayland-0' }, 'wl-copy'],
  ['linux', { DISPLAY: ':0' }, 'xclip'],
] as const)('copies literal UTF-8 text through stdin on %s', async (platform, env, command) => {
  const exec = vi.fn<ExecFn>(async () => ok)
  const text = 'brew install cloudflared\natc restart\n$(`not executed`) буфер'
  expect(await copyToClipboard(text, platform, env, exec)).toBe(true)
  expect(exec).toHaveBeenCalledWith(command, expect.any(Array), expect.objectContaining({ input: text }))
  expect(exec.mock.calls[0]?.[1].join(' ')).not.toContain(text)
})
it.each([{ SSH_CONNECTION: 'host' }, { SSH_TTY: '/dev/pts/0' }, { SSH_CLIENT: 'host' }])(
  'leaves remote copying to the terminal',
  async (env) => {
    const exec = vi.fn<ExecFn>()
    expect(await copyToClipboard('command', 'darwin', env, exec)).toBe(false)
    expect(exec).not.toHaveBeenCalled()
  }
)
it('tries the next Linux helper and reports failure instead of claiming success', async () => {
  const exec = vi
    .fn<ExecFn>()
    .mockResolvedValueOnce({ ...ok, code: null, error: 'ENOENT' })
    .mockResolvedValueOnce(ok)
  expect(await copyToClipboard('command', 'linux', { DISPLAY: ':0' }, exec)).toBe(true)
  expect(exec.mock.calls.map(([command]) => command)).toEqual(['xclip', 'xsel'])
  exec.mockResolvedValue({ ...ok, code: 1 })
  await expect(copyToClipboard('command', 'darwin', {}, exec)).rejects.toThrow('Could not copy')
  exec.mockResolvedValue({ ...ok, timedOut: true })
  await expect(copyToClipboard('command', 'darwin', {}, exec)).rejects.toThrow('Could not copy')
  expect(await copyToClipboard('command', 'linux', {}, exec)).toBe(false)
})
