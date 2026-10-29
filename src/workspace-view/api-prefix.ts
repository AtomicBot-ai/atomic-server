/** A literal path the API router and clients can use without URL encoding changing it. */
export function apiPrefixError(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('/'))
    return 'Start the API prefix with /, for example /v1.'
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    !/^(?:\/[A-Za-z0-9._~-]+)*\/?$/.test(value) ||
    value.split('/').some((part) => part === '.' || part === '..')
  )
    return 'Use an API prefix such as /v1: slash-separated letters, numbers, dots, underscores, tildes or hyphens; no spaces or URL escapes.'
  return undefined
}
