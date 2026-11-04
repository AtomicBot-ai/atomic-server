import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { ATC, runAtc } from '../helpers/binary.js'
import { readyWorkspace } from '../helpers/ready-workspace.js'
import { hasPython, runPty } from '../helpers/pty-driver.js'

const scratch = mkdtempSync(join(tmpdir(), 'atc-compact-tui-'))
const modes = ['truecolor', '256', 'no-color'] as const
afterAll(() => {
  for (const mode of modes) runAtc(['stop', '--data-folder', join(scratch, mode), '--force', '--kill'])
  rmSync(scratch, { recursive: true, force: true })
})

describe.skipIf(process.platform === 'win32' || !hasPython())('compact terminal workspace', () => {
  it.each(modes)('retains input through Help, sections and resize in %s', (mode) => {
    const folder = join(scratch, mode)
    readyWorkspace(folder)
    expect(runAtc(['config', 'set', 'admin.port', '0', '--data-folder', folder]).code).toBe(0)
    expect(runAtc(['config', 'set', 'tui.motion', 'false', '--data-folder', folder]).code).toBe(0)
    const result = runPty(
      [
        { wait: 'ATOMIC SERVER' },
        { type: '\u001b2' },
        { wait: 'Write a message' },
        { type: 'draft stays' },
        { wait: 'draft stays', fresh: true },
        { type: '\u000b' },
        { wait: 'Keyboard shortcuts', fresh: true },
        { click: 'Keyboard shortcuts' },
        { wait: 'Next / previous control', fresh: true },
        { type: '\u001b' },
        { type: ' here' },
        { wait: 'draft stays here', fresh: true },
        { resize: [32, 110] },
        { wait: 'draft stays here' },
        { resize: [24, 80] },
        { wait: '2 Playground' },
        { type: '\u001b' },
        { wait: 'Images', fresh: true },
        { type: '\u001b' },
        { resize: [20, 54] },
        { type: '!' },
        { wait: 'draft stays here!', fresh: true },
        { type: '\u0011' },
      ],
      [...ATC, '--data-folder', folder],
      {
        ...process.env,
        HF_ENDPOINT: 'http://127.0.0.1:9',
        ATC_LITERT_LM_MODELS_URL: 'http://127.0.0.1:9',
        NO_COLOR: mode === 'no-color' ? '1' : undefined,
        FORCE_COLOR: mode === 'no-color' ? undefined : mode === 'truecolor' ? '3' : '2',
        COLORTERM: mode === 'truecolor' ? 'truecolor' : '',
      }
    )
    expect(result.ok, result.failed.join(', ') + '\n' + result.out.slice(-3000)).toBe(true)
    expect(result.code).toBe(0)
  })
})
