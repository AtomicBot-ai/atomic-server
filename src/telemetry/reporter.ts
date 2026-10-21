/**
 * The reporter of atc's own failures, beside the core's: the core's `ErrorReporter` (envelopes over
 * `fetch`, scrubbing, dedup and caps) pointed at atc's project. One consent covers both projects:
 * until the core exists it is resolved as the core would (environment "off", the host, the stored
 * choice), then the core's live state decides, so `config set telemetry.enabled` reaches both.
 */

import {
  ensureInstallId,
  envConsent,
  ErrorReporter,
  readTelemetryFile,
  resolveConsent,
  systemContext,
} from '@atomic-chat/core/host'
import type { ErrorReport, ErrorSink, TelemetryControl } from '@atomic-chat/core/host'
import { ATC_GIT_SHA, ATC_VERSION, CORE_VERSION } from '../version.js'
import { atcReportingConfig, BAKED_REPORTING } from './config.js'
import type { BakedReporting } from './config.js'

export class AtcErrorReporter implements ErrorSink {
  private core: TelemetryControl | undefined
  constructor(
    private readonly reporter: ErrorReporter | undefined,
    private readonly initialConsent: boolean
  ) {}

  /** From now on the core's consent decides (the person's live choice). */
  follow(core: TelemetryControl | undefined): void {
    this.core = core
  }

  capture(report: ErrorReport): void {
    const consent = this.core ? this.core.state().enabled : this.initialConsent
    if (consent) this.reporter?.capture(report)
  }

  /** Wait for in-flight sends, at most `timeoutMs`. Never rejects. */
  flush(timeoutMs?: number): Promise<void> {
    return this.reporter?.flush(timeoutMs) ?? Promise.resolve()
  }
}

export interface AtcReporterInput {
  env: NodeJS.ProcessEnv
  /** The host's consent (`--telemetry`, `telemetry.enabled` set in the config); undefined: not given. */
  consent: boolean | undefined
  dataFolder: string
  /** `<data>/atomic-core/telemetry.json`: the stored choice and the install id the core uses too. */
  telemetryFile: string
  homeDir: string
  platform: NodeJS.Platform
  arch: string
  fetch: typeof fetch
  warn: (message: string) => void
  baked?: BakedReporting
  /** Set when the process runs under a test runner whatever `env` says; `env` is checked as well. */
  testRun?: boolean
}

export async function createAtcReporter(input: AtcReporterInput): Promise<AtcErrorReporter> {
  const config = atcReportingConfig({
    baked: input.baked ?? BAKED_REPORTING,
    env: input.env,
    version: ATC_VERSION,
    gitSha: ATC_GIT_SHA,
    testRun: input.testRun ?? false,
  })
  const stored = await readTelemetryFile(input.telemetryFile)
  const { enabled } = resolveConsent({
    env: envConsent(input.env),
    host: input.consent,
    stored: stored.enabled,
  })
  if (!config) return new AtcErrorReporter(undefined, enabled)
  // The core's install id: one anonymous user across both projects, minted (as the core does) whenever
  // this build reports at all, since `config set` may turn consent on later.
  const installId = await ensureInstallId(input.telemetryFile, stored)
  const reporter = new ErrorReporter({
    config,
    coreVersion: CORE_VERSION,
    platform: input.platform,
    arch: input.arch,
    ownerScope: 'cli',
    host: 'atc',
    hostVersion: ATC_VERSION,
    // Consent is decided above and by `follow`; the reporter only sends.
    enabled: true,
    installId,
    system: systemContext(),
    scrub: { dataFolder: input.dataFolder, homeDir: input.homeDir },
    fetch: input.fetch,
    onSendError: input.warn,
  })
  return new AtcErrorReporter(reporter, enabled)
}
