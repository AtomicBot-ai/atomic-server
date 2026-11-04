import { sentryAgentDiagnosticTags } from './sentry-agent-diagnostics.js'
/** Fixed runtime messages become finite tags; arbitrary exception text stays private. */
const SEGMENTER_FAILURES = new Map([
  ['failed to initialize Segments', 'JSC_INTL_SEGMENTS_INIT_FAILED'],
  [
    "Intl.Segmenter.prototype.segment called on value that's not a Segmenter",
    'JSC_INTL_SEGMENTER_BAD_RECEIVER',
  ],
])

function sentryBaseNativeFailureTags(error: unknown): Record<string, string> {
  if (!(error instanceof TypeError)) return {}
  const diagnostic = SEGMENTER_FAILURES.get(error.message)
  return diagnostic ? { native_failure: diagnostic } : {}
}

export function nativeFailureTags(error: unknown): Record<string, string> {
  return { ...sentryBaseNativeFailureTags(error), ...sentryAgentDiagnosticTags(error) }
}
