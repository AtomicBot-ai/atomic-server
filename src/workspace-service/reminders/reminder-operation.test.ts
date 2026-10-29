import { afterEach, expect, it, vi } from 'vitest'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../../config/index.js'
import { WORKSPACE_OPERATIONS, WorkspaceService } from '../index.js'

const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).forEach((fn) => fn()))

it('takes setup.reminder on the server and shows no reminder until one is registered', async () => {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const request = vi.fn<typeof fetch>()
  const service = new WorkspaceService({
    link: fakeCoreLink(),
    paths: tmp.paths,
    config: defaultConfig(),
    fetch: request,
  })
  expect(WORKSPACE_OPERATIONS.find((op) => op.name === 'setup.reminder')).toMatchObject({
    effect: 'configure',
    mutates: true,
  })
  await expect(service.execute('setup.reminder', {})).rejects.toThrow('email is required')
  await expect(service.execute('setup.reminder', { email: 'nope' })).rejects.toThrow('valid email')
  await expect(service.execute('setup.reminder', { email: 'me@example.com' })).rejects.toThrow(
    'No model is downloading'
  )
  expect(request).not.toHaveBeenCalled()
  expect((await service.snapshot()).reminder).toBeNull()
})
