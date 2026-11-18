// SENTRY_AGENT_DIAGNOSTIC_CONFIG {"rules":[{"source":"src/workspace-service/chat/chat-stream.ts","message":"The engine returned an empty response.","code":"CHAT_STREAM_EMPTY_RESPONSE"},{"source":"src/workspace-service/chat/chat-stream.ts","message":"An engine stream frame exceeded 8 MB.","code":"CHAT_STREAM_FRAME_TOO_LARGE"},{"source":"src/workspace-service/chat/chat-stream.ts","message":"The stream ended unexpectedly. The partial answer is saved.","code":"CHAT_STREAM_ENDED_UNEXPECTEDLY"},{"source":"src/workspace-service/chat/chat-stream.ts","message":"Invalid tool-call index.","code":"CHAT_STREAM_INVALID_TOOL_CALL_INDEX"}],"include_cause_codes":true}
// This generated observer only enriches an existing error event. It never sends or logs.
const SENTRY_AGENT_MESSAGES = new Map<string, string>([
  ['The engine returned an empty response.', 'CHAT_STREAM_EMPTY_RESPONSE'],
  ['An engine stream frame exceeded 8 MB.', 'CHAT_STREAM_FRAME_TOO_LARGE'],
  ['The stream ended unexpectedly. The partial answer is saved.', 'CHAT_STREAM_ENDED_UNEXPECTEDLY'],
  ['Invalid tool-call index.', 'CHAT_STREAM_INVALID_TOOL_CALL_INDEX'],
])
const SENTRY_AGENT_CAUSES = new Set<string>([
  'ENOENT',
  'ENOTDIR',
  'EISDIR',
  'EACCES',
  'EPERM',
  'ENOSPC',
  'EIO',
  'EBUSY',
  'ENOMEM',
  'ECONNREFUSED',
  'ConnectionRefused',
  'ECONNRESET',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EPIPE',
  'UND_ERR_SOCKET',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
])

/** Finite codes only: messages, paths and arbitrary thrown objects never leave this function. */
export function sentryAgentDiagnosticTags(error: unknown): Record<string, string> {
  const tags: Record<string, string> = {}
  const seen = new Set<Error>()
  try {
    for (let depth = 0; error instanceof Error && depth < 5 && !seen.has(error); depth++) {
      seen.add(error)
      const message: unknown = Object.getOwnPropertyDescriptor(error, 'message')?.value
      if (!tags['diagnostic_code'] && typeof message === 'string') {
        const code = SENTRY_AGENT_MESSAGES.get(message)
        if (code) tags['diagnostic_code'] = code
      }
      const code: unknown = Object.getOwnPropertyDescriptor(error, 'code')?.value
      if (typeof code === 'string' && SENTRY_AGENT_CAUSES.has(code)) tags['diagnostic_cause_code'] = code
      error = Object.getOwnPropertyDescriptor(error, 'cause')?.value
    }
  } catch {
    // A hostile Error getter must not change the result of the observed operation.
  }
  return tags
}
