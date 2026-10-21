import { CoreClient } from '@atomic-chat/core/client'
import type { CoreClientOptions } from '@atomic-chat/core/client'

/**
 * A fetch for calls that may answer after minutes: preparing a Foundry Local accelerator (gigabytes,
 * one request) or loading a large model. The binary's runtime ends any request whose answer has not
 * come in 300 s, which reads as "Cannot reach the Atomic Chat core" while the core goes on with the
 * work; `timeout: false` turns that limit off there and is an unknown field Node ignores. The caller's
 * own `signal` still ends the call.
 */
export function patientFetch(request: typeof fetch = fetch): typeof fetch {
  return ((input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    request(input, { ...init, timeout: false } as RequestInit)) as typeof fetch
}

/** The core's control client over `patientFetch`: the server's own calls to the core it runs. */
export function patientCoreClient(options: Omit<CoreClientOptions, 'fetch'>): CoreClient {
  return new CoreClient({ ...options, fetch: patientFetch() })
}
