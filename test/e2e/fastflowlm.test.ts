import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, expect, it } from 'vitest'
import { CORE_VERSION } from '@atomic-chat/core'
import { runAtcAsync } from '../helpers/async-binary.js'
import { flmFixture } from '../helpers/fastflowlm.js'
import baseline from '../../src/workspace-service/models/model-catalog-baseline.json' with { type: 'json' }
const root = mkdtempSync(join(tmpdir(), 'atc-flm-'))
const catalog = join(root, 'catalog.json'),
  manifest = join(root, 'manifest.json')
writeFileSync(catalog, JSON.stringify(baseline))
writeFileSync(manifest, JSON.stringify({ schema_version: 1, engine: 'fastflowlm', releases: [] }))
const env = {
  ...process.env,
  ATOMIC_MODEL_CATALOG_URL: pathToFileURL(catalog).href,
  ATOMIC_FASTFLOWLM_MANIFEST_URL: pathToFileURL(manifest).href,
}
const atc = (...args: string[]) => runAtcAsync([...args, '--data-folder', join(root, 'data')], { env })
afterAll(async () => {
  await atc('stop', '--force', '--kill')
  rmSync(root, { recursive: true, force: true })
})
it('embeds the FLM SDK, keeps a legacy catalog empty and exposes durable operations in the built server', async () => {
  const version = await atc('version', '--json')
  expect(JSON.parse(version.out).core).toBe(CORE_VERSION)
  expect((await atc('start', '--admin-port', '0', '--json')).code).toBe(0)
  const models = await atc('models', 'catalog', '--engine', 'fastflowlm', '--json')
  expect(models.code, models.err).toBe(0)
  expect(JSON.parse(models.out)).toMatchObject({ models: [] })
  const status = await atc('control', 'call', 'fastflowlm.operations', '--json')
  expect(status.code, status.err).toBe(0)
  const watch = await atc('control', 'watch', '--count', '1')
  expect(JSON.parse(watch.out).snapshot.fastflowlm_operations).toEqual([])
  expect((await atc('engines', 'accelerators', '--help')).out).toContain('FastFlowLM')
})

it('reports the actual host setup in the compiled CLI without starting a driver operation', async () => {
  const result = await atc('engines', 'accelerators', 'fastflowlm', '--prepare', '--dry-run', '--json')
  expect(result.code, result.err).toBe(0)
  const plan = JSON.parse(result.out)
  expect(plan.packages).toEqual([])
  expect(
    plan.changes.some((change: { code: string }) =>
      ['install-driver', 'install-packages'].includes(change.code)
    )
  ).toBe(false)
  if (plan.driver_setup) {
    expect(plan.status).toBe('blocked')
    expect(plan.driver_setup.links.length).toBeGreaterThan(0)
  }
  const operations = await atc('control', 'call', 'fastflowlm.operations', '--json')
  expect(operations.code, operations.err).toBe(0)
  expect(JSON.parse(operations.out)).toEqual({
    schema_version: 1,
    operation: 'fastflowlm.operations',
    status: 'ok',
    result: [],
  })
})

it('lists upstream models and conf recommendations through the compiled server', async () => {
  const f = await flmFixture()
  f.definition.qualification = { status: 'upstream', evidence: ['https://fixture.test/upstream'] }
  f.definition.recommended = true
  await f.save()
  const call = (...args: string[]) =>
    runAtcAsync([...args, '--data-folder', f.paths.dataFolder], {
      env: { ...env, ATOMIC_MODEL_CATALOG_URL: pathToFileURL(join(f.paths.atcDir, 'catalog.json')).href },
    })
  try {
    expect((await call('start', '--admin-port', '0', '--json')).code).toBe(0)
    const result = await call('models', 'catalog', '--engine', 'fastflowlm', '--json')
    expect(result.code, result.err).toBe(0)
    expect(JSON.parse(result.out)).toMatchObject({
      models: [{ model_id: f.definition.model_id, recommended: true, unverified: true }],
    })
  } finally {
    await call('stop', '--force', '--kill')
    f.cleanup()
  }
})
