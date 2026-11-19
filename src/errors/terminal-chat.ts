const MESSAGES = {
  CLI_CHAT_ENDPOINT_INVALID: 'Use an HTTP endpoint without credentials, a query, or a fragment.',
  CLI_CHAT_GENERATION_ERROR: 'The server reported a generation error. Inspect the server log.',
  CLI_CHAT_EMPTY_RESPONSE: 'The server returned an empty response.',
  CLI_CHAT_STREAM_TRUNCATED: 'The response ended before completion. The partial reply is kept.',
} as const

type TerminalChatCode = keyof typeof MESSAGES

/** A failure detected by the terminal client itself. The code is reporting metadata. */
export class TerminalChatError extends Error {
  readonly #code: TerminalChatCode

  constructor(code: TerminalChatCode) {
    super(MESSAGES[code])
    this.#code = code
  }

  static diagnosticCode(error: unknown): TerminalChatCode | undefined {
    if (!(error instanceof Error) || !(#code in error)) return undefined
    const code = error.#code
    return Object.hasOwn(MESSAGES, code) ? code : undefined
  }
}
