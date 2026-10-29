import type { ErrorReport, ErrorSink, TelemetryControl } from '@atomic-chat/core/host'
import type { AtcErrorReporter } from './reporter.js'
import { flushWithin } from './flush.js'
import { technicalError } from './failures.js'

export interface ProcessErrorSink extends ErrorSink {
  setHostConsent?(enabled: boolean | undefined): void
  setWarningHandler?(warn: (message: string) => void): void
  flush(timeoutMs?: number): Promise<void>
  follow(core: TelemetryControl | undefined): void
}

/** One reporter per process, initialized only for a failure; its entire exit wait is bounded. */
export class LazyErrorReporter implements ProcessErrorSink {
  private reporter: Promise<AtcErrorReporter> | undefined
  private core: TelemetryControl | undefined
  private pending = new Set<Promise<void>>()
  private hostConsent: boolean | undefined
  private exitWait: Promise<void> | undefined
  constructor(
    private create: (
      consent: boolean | undefined,
      warn: (message: string) => void
    ) => Promise<AtcErrorReporter>,
    private warn: (message: string) => void = () => {}
  ) {}
  setWarningHandler(warn: (message: string) => void): void {
    this.warn = warn
  }
  setHostConsent(enabled: boolean | undefined): void {
    this.hostConsent = enabled
  }

  follow(core: TelemetryControl | undefined): void {
    this.core = core
  }

  capture(report: ErrorReport): void {
    if (this.hostConsent === false) return
    if (report.source === 'uncaught_exception' || report.source === 'unhandled_rejection')
      report = {
        ...report,
        error: technicalError(report.error, report.source),
        tags: { ...report.tags, component: 'process' },
      }
    const task = (this.reporter ??= Promise.resolve().then(() =>
      this.create(this.hostConsent, (message) => this.warn(message))
    ))
      .then((reporter) => {
        reporter.follow(this.core)
        reporter.capture(report)
      })
      .catch(() => {
        /* A broken config or reporting outage must not cause another failure. */
      })
      .finally(() => this.pending.delete(task))
    this.pending.add(task)
  }

  async flush(timeoutMs = 2000): Promise<void> {
    if (!this.reporter) return
    await (this.exitWait ??= flushWithin(async (remaining) => {
      await Promise.allSettled([...this.pending])
      const reporter = await this.reporter
      await reporter?.flush(remaining())
    }, timeoutMs))
  }
}
