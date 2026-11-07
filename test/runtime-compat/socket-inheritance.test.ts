import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

it('releases and rebinds the API port while a subsequently spawned engine stays alive', async () => {
  const fixture = fileURLToPath(new URL('../fixtures/socket-inheritance.mjs', import.meta.url))
  const { stdout } = await promisify(execFile)(process.execPath, [fixture], { timeout: 45000 })
  expect(stdout).toContain('API restarted on the same port with the original child alive')
}, 50000)
