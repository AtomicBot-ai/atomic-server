import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import catalogExcerpt from '../../../test/fixtures/strata/catalog.json' with { type: 'json' }
import { defaultConfig } from '../../config/index.js'
import { WorkspaceService } from '../index.js'
import { catalogFixture } from '../../../test/helpers/model-catalog-fixture.js'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'

it('resumes the pinned plan after restart and reports the same preparation without transferring again', async () => {
  const { paths, cleanup } = tmpDataFolder('strata-recovery-')
  const link = fakeCoreLink()
  const catalogPath = join(paths.dataFolder, 'catalog.json')
  const directory = join(paths.dataFolder, 'import')
  const descriptor = structuredClone(catalogExcerpt.models['strata-qwen38-iq3-xxs'].definition)
  const bytes = Buffer.from('fixture')
  const fileHash = createHash('sha256').update(bytes).digest('hex')
  for (const file of descriptor.files) Object.assign(file, { size: bytes.length, sha256: fileHash })
  descriptor.requirements.download_bytes = bytes.length * descriptor.files.length
  const offline = vi.fn<typeof fetch>(async () => {
    throw new Error('Unexpected model download')
  })
  const options = {
    link,
    paths,
    config: defaultConfig(),
    env: { ATOMIC_MODEL_CATALOG_URL: pathToFileURL(catalogPath).href },
    fetch: offline,
  }
  let operation: Record<string, unknown> | undefined
  link.responses['POST /models/strata/check'] = () => ({
    verdict: 'ok',
    preparation_status: operation?.['state'] === 'ready' ? 'ready' : 'files-ready',
  })
  link.responses['POST /strata/preparations'] = (request: unknown) => {
    operation ??= { ...(request as object), operation_id: 'prep-1', state: 'preparing', revision: 1 }
    return operation
  }
  link.responses['GET /strata/preparations'] = () => (operation ? [operation] : [])
  link.responses['GET /strata/preparations/prep-1'] = () => operation
  link.responses['POST /strata/preparations/prep-1/resume'] = () =>
    (operation = { ...operation, state: 'ready', revision: 3 })
  link.responses['GET /models/strata/maintenance'] = []
  let first: WorkspaceService | undefined
  let second: WorkspaceService | undefined
  try {
    const catalog = catalogFixture()
    Object.assign(catalog.models, catalogExcerpt.models)
    Object.assign(catalog.collections, catalogExcerpt.collections)
    const entry = catalog.models['strata-qwen38-iq3-xxs']!
    entry.definition = descriptor
    await mkdir(paths.dataFolder, { recursive: true })
    await writeFile(catalogPath, JSON.stringify(catalog))
    for (const file of descriptor.files) {
      const path = join(directory, file.path)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, bytes)
    }
    first = new WorkspaceService(options)
    const model = descriptor.variant_id
    const plan = (await first.execute('strata.plan', { model, import_directory: directory })) as {
      digest: string
    }
    const input = { request_id: 'fixture-install', plan_digest: plan.digest }
    await first.execute('strata.install', input)
    await vi.waitFor(() => expect(operation).toMatchObject({ state: 'preparing' }))
    await expect(first.execute('models.installed')).resolves.toMatchObject([
      { id: model, store: 'strata', disabled_reason: 'Preparing model' },
    ])
    first.stop()
    await vi.waitFor(async () =>
      expect(await first!.execute('strata.status')).toMatchObject([{ stage: 'interrupted' }])
    )
    operation = { ...operation, state: 'interrupted', revision: 2 }
    await writeFile(catalogPath, JSON.stringify(catalogFixture()))
    second = new WorkspaceService(options)
    expect(await second.execute('strata.status')).toMatchObject([
      { id: input.request_id, stage: 'interrupted' },
    ])
    await second.execute('strata.install', input)
    await vi.waitFor(async () =>
      expect(await second!.execute('strata.status')).toMatchObject([
        { id: input.request_id, stage: 'ready', preparation: { operation_id: 'prep-1', revision: 3 } },
      ])
    )
    await expect(second.execute('models.installed')).resolves.toMatchObject([
      { id: model, store: 'strata', disabled_reason: null },
    ])
    expect(offline).not.toHaveBeenCalled()
    expect(link.calls.filter(({ path }) => path === '/strata/preparations/prep-1/resume')).toHaveLength(1)
  } finally {
    first?.stop()
    second?.stop()
    cleanup()
  }
})
