import { describe, expect, it } from 'vitest'
import { fakeCoreLink } from '../../test/helpers/fake-core-link.js'
import { holdCommandLease, releaseCommandLease } from './command-lease.js'

describe('command lease', () => {
  it('holds one named client and releases it', async () => {
    const link = fakeCoreLink()
    await holdCommandLease(link, 'atc models pull')
    expect(link.snapshotValue.clients.map((client) => client.name)).toEqual(['atc models pull'])
    await holdCommandLease(link, 'atc other')
    expect(link.snapshotValue.clients).toHaveLength(1)
    await releaseCommandLease()
    expect(link.snapshotValue.clients).toEqual([])
    await releaseCommandLease()
  })
})
