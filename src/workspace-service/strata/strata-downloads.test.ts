import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { parseStrataDescriptor } from '@atomic-chat/core/client'
import type { Downloader } from '../../downloads/index.js'
import catalog from '../../../test/fixtures/strata/catalog.json' with { type: 'json' }
import { defaultConfig } from '../../config/index.js'
import { catalogFixture } from '../../../test/helpers/model-catalog-fixture.js'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { StrataSetups } from './setups.js'
import { downloadStrataSources } from './sources.js'

const descriptor = parseStrataDescriptor(catalog.models['strata-qwen38-iq3-xxs'].definition)

it('passes every pinned Strata input to the resumable server downloader', async () => {
  const download = vi.fn<Downloader['download']>()
  await downloadStrataSources(download, 'install-1', '/staging', descriptor, null, 'fixture-token')
  const [id, files, options] = download.mock.calls[0]!
  expect(id).toBe('install-1')
  expect(options?.resume).toBe(true)
  expect(files).toHaveLength(descriptor.files.length)
  for (const [index, file] of descriptor.files.entries()) {
    const source = descriptor.sources.find((item) => item.id === file.source)!
    expect(files[index]).toMatchObject({
      sha256: file.sha256,
      size: file.size,
      save_path: join('/staging', file.path),
    })
    expect(files[index]!.url).toContain(source.revision)
  }
  const server = vi.fn<typeof fetch>(async (url) =>
    String(url).startsWith('https://huggingface.co')
      ? new Response(null, { status: 302, headers: { location: 'https://cdn.example/payload' } })
      : new Response(null)
  )
  await options!.wrapFetch!(server)(new URL('https://huggingface.co/source'), { method: 'GET' })
  expect(new Headers(server.mock.calls[0]![1]?.headers).get('authorization')).toBe('Bearer fixture-token')
  expect(new Headers(server.mock.calls[1]![1]?.headers).get('authorization')).toBeNull()
  expect(JSON.stringify(files)).not.toContain('fixture-token')
})

it('continues a cancelled network transfer with the saved revisions after the catalog changes', async () => {
  const { paths, cleanup } = tmpDataFolder()
  const link = fakeCoreLink()
  link.responses['GET /strata/preparations'] = []
  let tightDisk = false
  link.responses['POST /models/strata/check'] = (request: unknown) =>
    tightDisk && (request as { staged_bytes?: number }).staged_bytes !== 5
      ? { verdict: 'insufficient-disk', reason: 'Room for the remaining sources only.' }
      : { verdict: 'ok' }
  const path = join(paths.dataFolder, 'catalog.json')
  const options = {
    paths,
    link,
    config: defaultConfig(),
    env: { ATC_MODEL_CATALOG_URL: pathToFileURL(path).href },
  }
  let stop: (() => void) | undefined
  const download = vi.fn<Downloader['download']>(
    () =>
      new Promise((_resolve, reject) => {
        stop = () => reject(new Error('Download cancelled'))
      })
  )
  const cancel = vi.fn<Downloader['cancel']>(() => {
    stop?.()
    return true
  })
  const setups = new StrataSetups(options, { download, cancel, snapshot: () => [] })
  try {
    const catalogDoc = catalogFixture()
    Object.assign(catalogDoc.models, catalog.models)
    Object.assign(catalogDoc.collections, catalog.collections)
    await mkdir(paths.dataFolder, { recursive: true })
    await writeFile(path, JSON.stringify(catalogDoc))
    const plan = await setups.plan(descriptor.variant_id, false)
    const input = { request_id: 'same-job', plan_digest: plan.digest }
    await setups.journal.install(input)
    await vi.waitFor(() => expect(download).toHaveBeenCalledOnce())
    expect(await setups.cancel(input.request_id)).toMatchObject({ stage: 'cancelled' })
    const files = download.mock.calls[0]![1]
    const draft = files.find(({ save_path }) => save_path.endsWith(join('draft', 'config.json')))!
    await mkdir(dirname(draft.save_path), { recursive: true })
    await writeFile(draft.save_path + '.tmp', 'abcde')
    await writeFile(draft.save_path + '.url', draft.url)
    const bad = files.find(({ save_path }) => save_path.endsWith('profile.bin'))!
    await writeFile(bad.save_path + '.tmp', 'bad')
    await writeFile(bad.save_path + '.url', bad.url + '?wrong-revision')
    tightDisk = true
    await writeFile(path, JSON.stringify(catalogFixture()))
    await setups.journal.install(input)
    await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(2))
    expect(link.calls.at(-1)).toMatchObject({
      path: '/models/strata/check',
      body: { descriptor, staged_bytes: 5 },
    })
    expect(download.mock.calls[0]?.slice(0, 2)).toEqual(download.mock.calls[1]?.slice(0, 2))
    expect(cancel).toHaveBeenCalledWith('atc-strata-download-same-job')
    await setups.cancel(input.request_id)
  } finally {
    setups.stop()
    cleanup()
  }
})
