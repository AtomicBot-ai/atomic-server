/** Error reports: what the core is told, atc's own reports beside the core's, and the one-time notice. */
export * from './notice.js'
export { AtcErrorReporter, createAtcReporter } from './reporter.js'
export type { AtcReporterInput } from './reporter.js'
export { captureReport } from '@atomic-chat/core/host'
export type { ErrorSink } from '@atomic-chat/core/host'
export { adminFailureReport, downloadFailureReport, startupFailureReport } from './reports.js'
