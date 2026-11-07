/** The compiled terminal uses the selected engine's catalog before any model is installed. */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { ATC } from '../helpers/binary.js'
import { runAtcAsync, runProcess } from '../helpers/async-binary.js'
import { catalogFixture } from '../helpers/model-catalog-fixture.js'
import { DRIVER, hasPython } from '../helpers/pty-driver.js'
import type { PtyResult } from '../helpers/pty-driver.js'

it.skipIf(process.platform === 'win32' || !hasPython()).each([
  ['llamacpp-upstream', 'Stock fixture'],
  ['atomic-prism', 'Prism fixture'],
  ['mlx', 'MLX fixture'],
])('shows only %s recommendations in a fresh profile', async (engine, title) => {
  const root = mkdtempSync(join(tmpdir(), 'atc-onboarding-engines-'))
  const data = join(root, 'data'),
    catalog = join(root, 'catalog.json')
  mkdirSync(join(data, 'atc'), { recursive: true })
  writeFileSync(join(data, 'atc', 'engine-choice.json'), JSON.stringify({ id: `${engine}|v1|native` }))
  writeFileSync(
    catalog,
    JSON.stringify(
      catalogFixture({
        'staff-picks': {
          picks: [
            { model_name: 'fixture/stock', title: 'Stock fixture', format: 'gguf' },
            { model_name: 'fixture/Bonsai', title: 'Prism fixture', format: 'gguf' },
            { model_name: 'fixture/mlx', title: 'MLX fixture', format: 'mlx' },
          ],
        },
      })
    )
  )
  const env = {
    ...process.env,
    TERM: 'xterm-256color',
    ATOMIC_MODEL_CATALOG_URL: pathToFileURL(catalog).href,
    ATC_MODEL_CATALOG_URL: pathToFileURL(catalog).href,
  }
  try {
    const start = await runAtcAsync(['start', '--admin-port', '0', '--data-folder', data], { env })
    expect(start.code, start.err).toBe(0)
    const result = await runProcess(
      'python3',
      [
        '-c',
        DRIVER,
        JSON.stringify([{ wait: 'Press any key' }, { type: '\r' }, { wait: title }, { type: '\u0011' }]),
        ...ATC,
        '--data-folder',
        data,
      ],
      { env }
    )
    expect(result.code, result.err).toBe(0)
    const session = JSON.parse(result.out.trim().split('\n').at(-1)!) as PtyResult
    expect(session.ok, session.out.slice(-4000)).toBe(true)
    expect(session.code).toBe(0)
    for (const other of ['Stock fixture', 'Prism fixture', 'MLX fixture'].filter((v) => v !== title))
      expect(session.out).not.toContain(other)
  } finally {
    await runAtcAsync(['stop', '--force', '--kill', '--data-folder', data], { env })
    rmSync(root, { recursive: true, force: true })
  }
})
