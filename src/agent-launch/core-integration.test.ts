import { expect, it, vi } from 'vitest'
import { tmpDataFolder } from '../../test/helpers/tmp-data-folder.js'
import { prepareCoreAgent } from './core-integration.js'

it('uses core launch arguments and the server credential for Muse', async () => {
  const tmp = tmpDataFolder()
  try {
    const home = tmp.paths.dataFolder
    const endpoint = 'http://127.0.0.1:1339/v1'
    const launch = await prepareCoreAgent('muse', endpoint, 'local-model', 'server-key', {
      cwd: home,
      folder: home,
      platform: 'linux',
      env: { HOME: home, OPENAI_API_KEY: 'other-provider' },
      exec: vi.fn(),
      find: (bin) => (bin === 'muse' ? '/usr/bin/muse' : undefined),
      request: async () => Response.json({ data: [{ id: 'local-model', context_length: 65536 }] }),
    })
    expect(launch).toMatchObject({
      command: '/usr/bin/muse',
      args: ['--provider', 'meta', '--base-url', endpoint, '--model', 'local-model'],
      env: { META_API_KEY: 'server-key' },
    })
    expect(launch.env).not.toHaveProperty('OPENAI_API_KEY')
  } finally {
    tmp.cleanup()
  }
})
