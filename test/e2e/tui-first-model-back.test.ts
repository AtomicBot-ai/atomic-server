/** The built program in a real PTY: Back must retain the model that Continue saves. No engine runs. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ModelRegistry } from '@atomic-chat/core/models'
import { afterAll, describe, expect, it } from 'vitest'
import { atcPathsFor } from '../../src/config/index.js'
import { ATC, runAtc } from '../helpers/binary.js'
import { hasPython, runPty } from '../helpers/pty-driver.js'

const scratch = mkdtempSync(join(tmpdir(), 'atc-e2e-first-model-'))
const folder = join(scratch, 'data')
afterAll(() => {
  runAtc(['--data-folder', folder, 'stop', '--force', '--kill'])
  rmSync(scratch, { recursive: true, force: true })
})
// eslint-disable-next-line no-control-regex
const strip = (s: string) => s.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')

describe.skipIf(process.platform === 'win32' || !hasPython())('first model back navigation', () => {
  it('keeps the second installed model after Permissions → Escape → Continue', async () => {
    const paths = atcPathsFor(folder)
    mkdirSync(paths.atcDir, { recursive: true })
    writeFileSync(
      paths.configFile,
      JSON.stringify({
        version: 5,
        admin: { port: 0 },
        api: { autoStart: false },
        tui: { motion: false },
        proxy: { url: 'http://127.0.0.1:9' },
        update: { checkOnStart: false },
        telemetry: { enabled: false },
      })
    )
    writeFileSync(
      join(paths.atcDir, 'terminal-model-catalog.json'),
      JSON.stringify({
        at: Date.now(),
        rows: [{ id: 'fixture/catalog', title: 'Catalog fixture', downloads: 0 }],
      })
    )
    const registry = new ModelRegistry(paths.layout)
    for (const [id, name] of [
      ['a-first', 'First fixture'],
      ['b-second', 'Second fixture'],
    ]) {
      const file = join(scratch, id! + '.gguf')
      writeFileSync(file, Buffer.alloc(32))
      await registry.write(id!, { model_path: file, name })
    }
    // A file hook supplies the upstream catalog. Every other catalog hits a closed proxy and falls
    // back locally; the test neither installs an engine nor calls an external host.
    const releases = join(scratch, 'releases.json')
    writeFileSync(
      releases,
      JSON.stringify({
        schema_version: 1,
        updated_at: '2026-10-29T00:00:00Z',
        upstream_repo: 'fixture/llama',
        download_base: 'http://127.0.0.1:9',
        releases: [
          {
            tag: 'b11463',
            commit: 'a'.repeat(40),
            published_at: '2026-10-29T00:00:00Z',
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
    const result = runPty(
      [
        { wait: 'Choose engine' },
        { type: '\r' },
        { wait: 'Choose your engine' },
        { type: 's' },
        { wait: 'Choose your first model' },
        { click: 'Second fixture' },
        { click: 'Continue' },
        { wait: 'Notifications' },
        { type: '\u001b' },
        { wait: 'Choose your first model', fresh: true },
        { click: 'Continue' },
        { wait: 'Notifications', fresh: true },
        { type: '\u0011' },
      ],
      [...ATC, '--data-folder', folder],
      {
        ...process.env,
        ATOMIC_LLAMACPP_UPSTREAM_RELEASES_URL: pathToFileURL(releases).href,
        ATOMIC_PRISM_MANIFEST_URL: 'http://127.0.0.1:9',
        HF_ENDPOINT: 'http://127.0.0.1:9',
      }
    )
    expect(result.ok, result.failed.join(', ') + '\n' + strip(result.out).slice(-4000)).toBe(true)
    expect(result.code, strip(result.out).slice(-2000)).toBe(0)
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8')).tui.model).toBe('b-second')
  })
})
