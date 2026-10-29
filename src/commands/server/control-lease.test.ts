import { expect, it } from 'vitest'
import { fakeCoreLink } from '../../../test/helpers/fake-core-link.js'
import { tmpDataFolder } from '../../../test/helpers/tmp-data-folder.js'
import { releaseCommandLease } from '../../cli/index.js'
import { defaultConfig } from '../../config/index.js'
import type { CommandContext } from '../../cli/index.js'
import { attachWorkspace } from './control.js'

it('holds a command lease while the workspace is attached', async () => {
  const tmp = tmpDataFolder('atc-lease-')
  const link = fakeCoreLink()
  const ctx = {
    leaseName: 'atc models pull',
    core: { attach: async () => link },
    config: async () => ({ values: defaultConfig() }),
    paths: tmp.paths,
    io: { fetch: async () => new Response('{}'), env: {} },
    host: { selfCommand: ['atc'] },
  } as unknown as CommandContext
  try {
    await attachWorkspace(ctx, false)
    expect(link.snapshotValue.clients.map((client) => client.name)).toEqual(['atc models pull'])
  } finally {
    await releaseCommandLease()
    tmp.cleanup()
  }
})
