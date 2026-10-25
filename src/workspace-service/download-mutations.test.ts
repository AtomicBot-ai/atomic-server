import { expect, it } from 'vitest'
import { DownloadMutations } from './download-mutations.js'
it('lets status reads run but queues new downloads until file removal settles', async () => {
  const queue = new DownloadMutations(),
    order: string[] = []
  let release!: () => void
  const removing = queue.run('downloads.remove', async () => {
    order.push('remove')
    await new Promise<void>((done) => {
      release = done
    })
    order.push('removed')
  })
  const installing = queue.run('models.install', async () => {
    order.push('install')
  })
  await queue.run('models.installed', async () => {
    order.push('read')
  })
  expect(order).toEqual(['read', 'remove'])
  release()
  await Promise.all([removing, installing])
  expect(order).toEqual(['read', 'remove', 'removed', 'install'])
})
it.each(['artifacts.load', 'models.load', 'media.load', 'media.embedding.load', 'media.decision.load'])(
  'serializes %s with removal so a load cannot start during file deletion',
  async (operation) => {
    const queue = new DownloadMutations(),
      order: string[] = []
    let release!: () => void
    const loading = queue.run(operation, async () => {
      order.push('loading')
      await new Promise<void>((done) => {
        release = done
      })
      order.push('loaded')
    })
    const removal = queue.run('downloads.remove', async () => {
      order.push('check loaded state')
    })
    await Promise.resolve()
    expect(order).toEqual(['loading'])
    release()
    await Promise.all([loading, removal])
    expect(order).toEqual(['loading', 'loaded', 'check loaded state'])
  }
)
