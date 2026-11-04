import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { catalogFixture } from '../helpers/model-catalog-fixture.js'
import { expect, it } from 'vitest'
import { ATC, runAtc } from '../helpers/binary.js'
import { hasPython, runPty } from '../helpers/pty-driver.js'
import { seedInterruptedSetup } from '../helpers/interrupted-setup.js'

it.skipIf(process.platform === 'win32' || !hasPython()).each(['models', 'engines'])(
  'keeps Downloads and both destinations inside onboarding while %s are pending',
  async (kind) => {
    const scratch = mkdtempSync(join(tmpdir(), 'atc-download-popup-'))
    const folder = join(scratch, 'data')
    mkdirSync(join(folder, 'atc'), { recursive: true })
    writeFileSync(
      join(folder, 'atc', 'config.json'),
      JSON.stringify({
        version: 5,
        admin: { port: 0 },
        api: { autoStart: false },
        tui: { motion: false },
        proxy: { url: 'http://127.0.0.1:9' },
        telemetry: { enabled: false },
        update: { checkOnStart: false },
      })
    )
    mkdirSync(join(folder, 'atc', 'cache'), { recursive: true })
    writeFileSync(
      join(folder, 'atc', 'cache', 'atomic-model-catalog-v1.json'),
      JSON.stringify({ at: Date.now(), catalog: catalogFixture() })
    )
    const releases = join(scratch, 'releases.json')
    writeFileSync(
      releases,
      JSON.stringify({
        schema_version: 1,
        updated_at: '2026-11-02T00:00:00Z',
        upstream_repo: 'fixture/llama',
        download_base: 'http://127.0.0.1:9',
        releases: [
          {
            tag: 'b11463',
            commit: 'a'.repeat(40),
            published_at: '2026-11-02T00:00:00Z',
            min_core_version: '0.0.0',
            assets: ['macos-arm64', 'macos-x64', 'ubuntu-arm64', 'ubuntu-x64'].map((target) => ({
              name: `llama-b11463-bin-${target}.tar.gz`,
              sha256: 'b'.repeat(64),
              size: 100,
              validation: 'approved',
            })),
          },
        ],
      })
    )
    if (kind === 'models') {
      await seedInterruptedSetup(folder)
      await seedInterruptedSetup(folder)
    } else {
      mkdirSync(join(folder, 'atc', 'engine-downloads'), { recursive: true })
      for (const engine of ['llamacpp-upstream', 'llamacpp'])
        writeFileSync(
          join(folder, 'atc', 'engine-downloads', `${engine}.json`),
          JSON.stringify({
            id: engine,
            taskId: engine,
            kind: 'engine',
            engine,
            name: engine,
            target: { version: 'b1', variant: 'cpu' },
            stage: 'downloading',
            total: 100,
            transferred: 20,
            created_at: Date.now(),
            updated_at: Date.now(),
          })
        )
    }
    try {
      const result = runPty(
        [
          { wait: 'Choose engine' },
          { type: '\r' },
          { wait: 'Choose your engine' },
          { type: 's' },
          { wait: 'Choose your first model' },
          { wait: ' memory', fresh: true },
          { click: 'Downloads 2' },
          { wait: 'Downloads', fresh: true },
          { type: '\u001b' },
          { wait: 'Choose your first model', fresh: true },
          { click: 'Downloads 2' },
          { wait: 'Downloads', fresh: true },
          { type: '\u001b[<0;1;1M' },
          { wait: 'Choose your first model', fresh: true },
          { click: 'Skip setup' },
          { wait: 'Getting your model ready', fresh: true },
          { type: '\u001b' },
          { wait: 'How will you use Atomic Server?', fresh: true },
          { click: 'Configure an endpoint' },
          { wait: 'Getting your model ready', fresh: true },
          { type: '\u001b' },
          { wait: 'How will you use Atomic Server?', fresh: true },
          { click: 'Connect an agent' },
          { wait: 'Getting your model ready', fresh: true },
          { click: "I can't wait" },
          { wait: 'Agents & tools', fresh: true },
          { type: '\u0011' },
        ],
        [...ATC, '--data-folder', folder],
        {
          ...process.env,
          HOME: join(scratch, 'home'),
          USERPROFILE: join(scratch, 'home'),
          ATOMIC_LLAMACPP_UPSTREAM_RELEASES_URL: pathToFileURL(releases).href,
          HF_ENDPOINT: 'http://127.0.0.1:9',
          ATOMIC_PRISM_MANIFEST_URL: 'http://127.0.0.1:9',
        }
      )
      if (!result.ok) writeFileSync(join(tmpdir(), 'atc-popup-failure.txt'), result.out)
      expect(result.ok, result.failed.join(', ') + '\n' + result.out.slice(-5000)).toBe(true)
      expect(result.code).toBe(0)
    } finally {
      runAtc(['--data-folder', folder, 'stop', '--force', '--kill'])
      rmSync(scratch, { recursive: true, force: true })
    }
  }
)
