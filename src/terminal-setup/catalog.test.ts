import { describe, expect, it } from 'vitest'
import { AtcError } from '../errors/index.js'
import { modelFiles } from './catalog.js'

/** What a runtime rejects with when nothing answers the connection: `fetch` fails, its cause keeps the code. */
const refused = () =>
  (async () => {
    throw Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    })
  }) as unknown as typeof fetch

describe('listing a repository’s GGUF files', () => {
  it('answers an unreachable Hugging Face as a refusal naming the connection, not a bare TypeError', async () => {
    const failure = await modelFiles('owner/repo', refused()).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(AtcError)
    expect(failure).toMatchObject({ code: 'ATC_USAGE' })
    expect((failure as AtcError).message).toBe('Could not reach Hugging Face for this repository.')
    expect((failure as AtcError).hint).toBe('Check this machine’s network or proxy, then retry.')
  })
})
