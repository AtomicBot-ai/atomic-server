import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { atcPathsFor } from '../../src/config/index.js'
import catalogExcerpt from '../fixtures/strata/catalog.json' with { type: 'json' }
import { catalogFixture } from '../helpers/model-catalog-fixture.js'
import { testRun } from '../helpers/test-context.js'
import { workspaceServer } from '../helpers/workspace-server.js'

it('uses the server’s Strata catalog, host verdicts and revisioned engine settings', async () => {
  const t = testRun()
  const paths = atcPathsFor(t.io.env['ATC_DATA_FOLDER']!)
  const { link } = t
  link.responses['POST /engines/versions'] = { engines: [{ engine: 'strata', kind: 'engine-build' }] }
  link.responses['POST /models/strata/check'] = {
    verdict: 'platform-unsupported',
    reason: 'No compatible GPU on this server.',
  }
  link.responses['GET /settings/strata'] = { revision: 3, values: { memory_mode: 'auto' } }
  let close: (() => Promise<void>) | undefined
  try {
    const catalog = catalogFixture()
    Object.assign(catalog.models, catalogExcerpt.models)
    Object.assign(catalog.collections, catalogExcerpt.collections)
    await mkdir(paths.cacheDir, { recursive: true })
    const path = join(paths.cacheDir, 'strata catalog.json')
    await writeFile(path, JSON.stringify(catalog))
    const workspace = await workspaceServer(link, paths, {
      ATOMIC_MODEL_CATALOG_URL: pathToFileURL(path).href,
    })
    close = workspace.close
    const command = async (...args: string[]) => {
      t.io.out.length = 0
      expect(await t.run([...args, '--json']), t.io.err.join('')).toBe(0)
      return JSON.parse(t.io.out.join(''))
    }
    const expected = {
      rows: [
        {
          id: 'iq3-xxs-dflash2',
          source: {
            provider: 'strata',
            check: { verdict: 'platform-unsupported', reason: 'No compatible GPU on this server.' },
          },
        },
      ],
    }
    expect((await command('models', 'catalog', '--engine', 'strata')).result).toMatchObject(expected)
    expect((await command('models', 'search', 'dflash2', '--engine', 'strata')).result).toMatchObject(
      expected
    )
    expect((await command('models', 'search', 'unlisted', '--engine', 'strata')).result.rows).toEqual([])
    expect(link.calls).toContainEqual({
      method: 'POST',
      path: '/models/strata/check',
      body: { descriptor: expect.objectContaining({ variant_id: 'iq3-xxs-dflash2' }) },
    })
    const dryRun = await command('models', 'pull', 'iq3-xxs-dflash2', '--engine', 'strata', '--dry-run')
    expect(dryRun).toMatchObject({
      model_id: 'iq3-xxs-dflash2',
      blockers: ['No compatible GPU on this server.'],
    })
    expect(dryRun.descriptor.files.length).toBeGreaterThan(2)
    expect(await command('config', 'set', 'engine.strata.vision', 'off')).toMatchObject({ value: 'off' })
    expect(link.calls).toContainEqual({
      method: 'PATCH',
      path: '/settings/strata',
      body: { values: { vision: 'off' }, expected_revision: 3 },
    })
  } finally {
    await close?.()
    t.cleanup()
  }
})
