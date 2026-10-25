import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { readDocument, writeDocument } from '../terminal-data/index.js'
import { forgetSetupDownload } from './forget-download.js'
const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))
it('forgets only the deleted download in durable onboarding records', async () => {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const path = join(tmp.paths.atcDir, 'setup.json'),
    job = join(tmp.paths.atcDir, 'setup-path.json')
  await writeDocument(path, {
    complete: false,
    onboarded: true,
    selections: [{ requestId: 'removed' }, { requestId: 'keep' }],
  })
  await writeDocument(job, { id: 'removed' })
  await forgetSetupDownload(tmp.paths.atcDir, 'removed')
  expect(await readDocument(path, null)).toEqual({
    complete: false,
    onboarded: true,
    selections: [{ requestId: 'keep' }],
  })
  expect(await readDocument(job, null)).toBeNull()
})
