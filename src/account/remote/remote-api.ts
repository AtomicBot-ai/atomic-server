/**
 * `/v1/remote/*` as a host calls it: wire format only. Shapes mirror the backend's `libs/dto/remote.py`;
 * the values that matter are sealed before they get here (`protocol.ts`).
 */
import { AccountApiError, type AccountCall } from '../account-api.js'

/** The longest wait the backend allows on a long-poll. */
export const MAX_WAIT_SECONDS = 25

export const REMOTE_CODES = {
  HOST_NOT_FOUND: 'host_not_found',
  GRANT_NOT_FOUND: 'grant_not_found',
  KEY_MISMATCH: 'key_mismatch',
  INVALID_STATE: 'invalid_state',
  DEVICE_NOT_REGISTERED: 'device_not_registered',
} as const

export interface DeviceInfo {
  id: string
  client_type: string
  device_name: string | null
  platform: string | null
}

/** A live grant as its host sees it in sync. */
export interface HostGrant {
  id: string
  status: 'pending' | 'approved' | 'active' | string
  method: 'code' | 'request' | string
  client: DeviceInfo
  client_public_key: string
  proof: string | null
  needs_credential: boolean
  credential_collected: boolean
  created_at: string
  decided_at: string | null
}

export interface HostSync {
  host: { id: string; name: string }
  state_version: number
  grants: HostGrant[]
  pairing_code: { expires_at: string } | null
}

export type TunnelState = 'online' | 'off' | 'error'

/** An id from the backend goes into a path only as a UUID. */
export function checkedId(id: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new AccountApiError(400, 'invalid_id')
  return id
}

/** The host's calls, each with an access token from the session. */
export function remoteApi(call: AccountCall) {
  return {
    registerDevice: (token: string, publicKey: string, deviceName?: string) =>
      call<{ id: string }>('PUT', '/v1/remote/device', {
        token,
        body: { public_key: publicKey, ...(deviceName ? { device_name: deviceName } : {}) },
      }),
    enableHost: (token: string, name: string) =>
      call<{ id: string; name: string }>('PUT', '/v1/remote/host', { token, body: { name } }),
    disableHost: (token: string) => call<void>('DELETE', '/v1/remote/host', { token }),
    sync: (
      token: string,
      input: { after: number | null; wait: number; tunnel: TunnelState; lan: boolean },
      signal?: AbortSignal
    ) => {
      const wait = Math.min(Math.max(0, input.wait), MAX_WAIT_SECONDS)
      return call<HostSync>('POST', '/v1/remote/host/sync', {
        token,
        waitSeconds: wait,
        ...(signal ? { signal } : {}),
        body: {
          wait,
          ...(input.after !== null ? { after: input.after } : {}),
          tunnel: input.tunnel,
          lan: input.lan,
        },
      })
    },
    openPairingCode: (token: string) =>
      call<{ code: string; expires_in: number; expires_at: string }>('POST', '/v1/remote/host/pairing-code', {
        token,
      }),
    closePairingCode: (token: string) => call<void>('DELETE', '/v1/remote/host/pairing-code', { token }),
    uploadEndpoints: (token: string, items: Array<{ grant_id: string; blob: string }>) =>
      call<void>('PUT', '/v1/remote/host/endpoints', { token, body: { items } }),
    decide: (token: string, grantId: string, allow: boolean) =>
      call<void>('POST', `/v1/remote/grants/${checkedId(grantId)}/${allow ? 'approve' : 'deny'}`, { token }),
    uploadCredential: (
      token: string,
      grantId: string,
      body: { envelope: string; mac?: string; client_public_key: string }
    ) => call<void>('PUT', `/v1/remote/grants/${checkedId(grantId)}/credential`, { token, body }),
    revokeGrant: (token: string, grantId: string) =>
      call<void>('DELETE', `/v1/remote/grants/${checkedId(grantId)}`, { token }),
  }
}

export type RemoteApi = ReturnType<typeof remoteApi>
