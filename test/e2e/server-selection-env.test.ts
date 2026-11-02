/** The built daemon retains environment precedence while config changes through another CLI process. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { runAtcAsync } from '../helpers/async-binary.js'

it('publishes the environment model instead of the persisted model after a live config edit', async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'atc-selection-env-')),
    folder = join(scratch, 'data')
  mkdirSync(join(folder, 'atc'), { recursive: true })
  writeFileSync(
    join(folder, 'atc', 'config.json'),
    JSON.stringify({
      version: 5,
      tui: { model: 'file-model' },
      api: { autoStart: false },
      engines: { autoInstall: false },
      telemetry: { enabled: false },
      update: { checkOnStart: false },
    })
  )
  const env = {
    ...process.env,
    ATC_TUI_MODEL: 'env-model',
    HOME: join(scratch, 'home'),
    USERPROFILE: join(scratch, 'home'),
  }
  const atc = (...args: string[]) => runAtcAsync(['--data-folder', folder, ...args], { env })
  const selection = async () => {
    const result = await atc('control', 'watch', '--count', '1')
    expect(result.code, result.err).toBe(0)
    return JSON.parse(result.out).snapshot.selection
  }
  try {
    const started = await atc('start', '--admin-port', '0')
    expect(started.code, started.err).toBe(0)
    expect(await selection()).toMatchObject({ model: 'env-model' })
    const edit = await atc('config', 'set', 'tui.model', 'changed-on-disk')
    expect(edit.code, edit.err).toBe(0)
    expect(await selection()).toMatchObject({ model: 'env-model' })
  } finally {
    await atc('stop', '--force', '--kill')
    rmSync(scratch, { recursive: true, force: true })
  }
})
