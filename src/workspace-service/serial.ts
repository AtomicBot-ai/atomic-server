/** A keyed queue whose failures never poison subsequent work. */
export class SerialWork {
  private queues = new Map<string, Promise<void>>()
  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const result = (this.queues.get(key) ?? Promise.resolve()).then(work)
    const done = result
      .then(
        () => undefined,
        () => undefined
      )
      .finally(() => {
        if (this.queues.get(key) === done) this.queues.delete(key)
      })
    this.queues.set(key, done)
    return result
  }
}
