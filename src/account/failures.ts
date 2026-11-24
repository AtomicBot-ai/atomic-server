/** What a client is told when the account service fails a call; never the service's own text. */
import { AtcError } from '../errors/index.js'
import { AccountApiError } from './account-api.js'

export function serviceFailure(error: unknown): never {
  if (error instanceof AtcError) throw error
  if (error instanceof AccountApiError) {
    if (error.status === 429) {
      const minutes = Math.max(1, Math.ceil(error.retryAfterMs / 60_000))
      throw new AtcError('ATC_USAGE', `Too many requests. Try again in ${minutes} min.`)
    }
    if (error.is('email_unavailable'))
      throw new AtcError('ATC_ACCOUNT_UNAVAILABLE', 'The account service cannot send email right now.')
    if (error.is('not_sharing'))
      throw new AtcError('ATC_USAGE', 'Sharing is off.', { hint: 'Turn it on with atc remote share on.' })
    if (error.is('invalid_id') || error.is('grant_not_found'))
      throw new AtcError('ATC_USAGE', 'No such device or request on this server.', {
        hint: 'List them with atc remote devices.',
      })
    if (error.is('invalid_state'))
      throw new AtcError('ATC_USAGE', 'That request was already decided or has expired.')
    if (error.is('limit_reached'))
      throw new AtcError('ATC_USAGE', 'The account has reached its limit of computers or devices.')
    if (error.is('not_signed_in') || error.is('invalid_grant'))
      throw new AtcError('ATC_ACCOUNT_REQUIRED', 'This server is not signed in to an Atomic Chat account.', {
        hint: 'Sign in with atc login.',
      })
    throw new AtcError('ATC_ACCOUNT_UNAVAILABLE', 'The account service refused the request.', {
      details: `${error.status} ${error.code}`,
    })
  }
  throw new AtcError(
    'ATC_ACCOUNT_UNAVAILABLE',
    "Could not reach the account service. Check this server's internet connection and try again.",
    { details: error instanceof Error ? error.message : String(error) }
  )
}
