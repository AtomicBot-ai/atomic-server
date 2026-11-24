import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../../config/index.js'
import { WorkspaceService } from '../index.js'

const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))

// The workspace snapshot lists every media installation record; one that cannot be read must not make
// the snapshot (and with it api.start, api.restart and chat.start) fail.
it('keeps the workspace readable when one media installation record is damaged', async () => {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const directory = join(tmp.paths.atcDir, 'media-installations')
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, 'kept.json'),
    JSON.stringify({ id: 'kept', stage: 'ready', updated_at: 1, plan: { digest: 'plan-kept', files: [] } })
  )
  await writeFile(join(directory, 'damaged.json'), '{ not json')
  const service = new WorkspaceService({ paths: tmp.paths, link: fakeCoreLink(), config: defaultConfig() })
  expect(await service.execute('artifacts.list')).toMatchObject([{ id: 'kept' }])
  expect((await service.snapshot()).setups).toMatchObject([{ id: 'kept' }])
})
