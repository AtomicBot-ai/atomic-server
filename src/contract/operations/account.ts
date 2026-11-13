import { operation } from './define.js'

/**
 * The Atomic Chat account: signing this server in and sharing its API with the account's devices. All of it
 * is `secret`: it opens this server to other devices, hands out codes or shows a waiting sign-in code, so an
 * agent gets it only with `atc mcp --allow-secrets`.
 */
export const ACCOUNT_OPERATIONS = [
  operation(
    'account.status',
    'Account',
    'secret',
    'Show the signed-in Atomic Chat account, a sign-in in progress, and remote access sharing with its devices.',
    {},
    // Secret, though it changes nothing: a waiting sign-in code would let whoever approves it first own the server.
    { mutates: false }
  ),
  operation(
    'account.signin.email.start',
    'Email me a sign-in code',
    'secret',
    'Send a one-time sign-in code to an email address; account.signin.email.verify takes the code.',
    { properties: { email: { type: 'string' } }, required: ['email'] }
  ),
  operation(
    'account.signin.email.verify',
    'Sign in with the emailed code',
    'secret',
    'Finish an email sign-in with the 6-digit code from the email.',
    { properties: { code: { type: 'string' } }, required: ['code'] }
  ),
  operation(
    'account.signin.device.start',
    'Sign in on another device',
    'secret',
    'Show a code and a link to approve this server from any browser; the server finishes the sign-in itself.'
  ),
  operation(
    'account.signin.cancel',
    'Cancel sign-in',
    'secret',
    'Drop an email or device sign-in that has not finished.'
  ),
  operation(
    'account.signout',
    'Sign out',
    'secret',
    'Sign this server out of its account; every device loses access to this server and must pair again.'
  ),
  operation(
    'account.remote.share',
    'Share with my devices',
    'secret',
    'Turn sharing of the API with the account’s devices on (starting the API and the tunnel) or off. Off ends every device’s access at once (each pairs again later); forget also removes this server from the account’s computers.',
    {
      properties: { enabled: { type: 'boolean' }, forget: { type: 'boolean' } },
      required: ['enabled'],
    }
  ),
  operation(
    'account.remote.pairing.open',
    'Add a device',
    'secret',
    'Open a 10-minute pairing code; the result holds the code and its QR link, shown nowhere else.'
  ),
  operation(
    'account.remote.pairing.close',
    'Close pairing code',
    'secret',
    'Close the open pairing code before it expires.'
  ),
  operation(
    'account.remote.decide',
    'Allow or deny a device',
    'secret',
    'Allow or deny a device that asked for access; compare its check code with the one on the device first.',
    {
      properties: { grant_id: { type: 'string' }, allow: { type: 'boolean' } },
      required: ['grant_id', 'allow'],
    }
  ),
  operation(
    'account.remote.revoke',
    'Revoke a device',
    'secret',
    'Revoke one device’s access to this server; its key is refused from the next request on.',
    { properties: { grant_id: { type: 'string' } }, required: ['grant_id'] }
  ),
] as const
