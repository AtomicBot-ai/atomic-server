/**
 * One snapshot read shared by everyone who asks within `maxAgeMs`: the web admin, the terminal UI and
 * `atc control watch` poll on their own clocks, and each read costs several core requests and folder
 * scans. A change this server makes or hears of (a mutation, a core event) invalidates it at once; the
 * age limit bounds what it cannot hear, such as the progress of its own downloads.
 */
export class SnapshotCache<T> {
  private generation = 0
  private running: { generation: number; read: Promise<T> } | null = null
  private kept: { generation: number; at: number; value: T } | null = null

  constructor(
    private readonly read: () => Promise<T>,
    private readonly options: { now: () => number; maxAgeMs: number }
  ) {}

  async get(): Promise<T> {
    const kept = this.kept
    if (kept && kept.generation === this.generation && this.options.now() - kept.at < this.options.maxAgeMs)
      return structuredClone(kept.value)
    return structuredClone(await this.start())
  }

  /** What was read so far no longer holds; a read already running is not handed to anyone after this. */
  invalidate(): void {
    this.generation++
    this.kept = null
  }

  private start(): Promise<T> {
    if (this.running?.generation === this.generation) return this.running.read
    const generation = this.generation
    const read = this.read().then((value) => {
      if (generation === this.generation) this.kept = { generation, at: this.options.now(), value }
      return value
    })
    const running = { generation, read }
    this.running = running
    const clear = () => {
      if (this.running === running) this.running = null
    }
    read.then(clear, clear)
    return read
  }
}
