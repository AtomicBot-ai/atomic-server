import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { runAtc } from '../helpers/binary.js'

it('delegates GenieX bundle inspection to the embedded core', () => {
  const dir = mkdtempSync(join(tmpdir(), 'atc-geniex-host-'))
  try {
    writeFileSync(join(dir, 'genie_config.json'), JSON.stringify({ dialog: { context: { size: 2048 } } }))
    const result = runAtc(['geniex-host', 'inspect', dir])
    expect(result.code, result.err).toBe(0)
    expect(JSON.parse(result.out)).toMatchObject({ kind: 'qairt', max_context_tokens: 2048 })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
