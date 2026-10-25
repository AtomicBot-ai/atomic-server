import { SerialWork } from './serial.js'
const writes = new Set([
  'models.install',
  'artifacts.install',
  'managed.install',
  'foundry.install',
  'setup.resume',
  'artifacts.resume',
  'downloads.remove',
  'models.remove',
  'models.load',
  'artifacts.load',
  'media.load',
  'media.embedding.load',
  'media.decision.load',
])
/** File removal, installs and model loads share one queue; reads and cancellation remain responsive. */
export class DownloadMutations {
  private readonly queue = new SerialWork()
  run<T>(operation: string, work: () => Promise<T>): Promise<T> {
    return writes.has(operation) ? this.queue.run('files', work) : work()
  }
}
