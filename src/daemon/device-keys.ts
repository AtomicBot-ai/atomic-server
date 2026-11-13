/**
 * The keys the public API accepts: the keyring's, then the keys of devices paired through the account while
 * sharing is on. No keyring (`undefined`, the file never existed) stays no keyring: device keys never open
 * or close a listener by themselves.
 */
export function withDeviceKeys(
  keyring: readonly string[] | undefined,
  devices: readonly string[]
): readonly string[] | undefined {
  if (keyring === undefined) return undefined
  return devices.length === 0 ? keyring : [...keyring, ...devices]
}
