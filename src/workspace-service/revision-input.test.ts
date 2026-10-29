import { afterEach, expect, it } from 'vitest'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { defaultConfig } from '../config/index.js'
import { WorkspaceService } from './index.js'

const cleanup: Array<() => void> = []
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn())
})

it('accepts a chat revision instead of rejecting it as unknown input', async () => {
  const tmp = tmpDataFolder()
  cleanup.push(tmp.cleanup)
  const service = new WorkspaceService({ link: fakeCoreLink(), paths: tmp.paths, config: defaultConfig() })
  const chat = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', messages: [{ role: 'user', content: 'hi' }] }
  await expect(service.execute('history.save', { chat, expected_revision: 0 })).resolves.toMatchObject({
    saved: true,
  })
  await expect(
    service.execute('chat.start', {
      request: { model: 'm', messages: chat.messages },
      conversation_id: chat.id,
      expected_revision: 1,
    })
  ).rejects.not.toThrow(/Unknown input/)
})
