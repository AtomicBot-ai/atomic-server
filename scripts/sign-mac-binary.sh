#!/usr/bin/env bash
# Sign Mach-O binaries with a Developer ID certificate (adapted from atomic-agent's script).
#
#   scripts/sign-mac-binary.sh <binary>...
#
# Env:
#   MACOS_CSC_LINK          base64-encoded PKCS#12 (.p12) Developer ID Application certificate
#   MACOS_CSC_KEY_PASSWORD  its password
#   MACOS_CSC_NAME          optional: the exact "Developer ID Application: …" identity
#   ATC_ALLOW_UNSIGNED=1    skip, with a warning, when the certificate is not configured (dry runs only)
#
# Unlike atomic-agent, missing secrets fail: a release must not go out unsigned by accident.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENTITLEMENTS="${SCRIPT_DIR}/entitlements.mac.plist"
LINK="${MACOS_CSC_LINK:-}"
PASS="${MACOS_CSC_KEY_PASSWORD:-}"

if [[ $# -eq 0 ]]; then
  echo "usage: $0 <binary>..." >&2
  exit 2
fi
if [[ -z "$LINK" || -z "$PASS" ]]; then
  if [[ "${ATC_ALLOW_UNSIGNED:-0}" == "1" ]]; then
    echo "warning: MACOS_CSC_LINK / MACOS_CSC_KEY_PASSWORD not set; leaving the binaries ad-hoc signed" >&2
    exit 0
  fi
  echo "error: MACOS_CSC_LINK and MACOS_CSC_KEY_PASSWORD are required to sign a release" >&2
  exit 1
fi
for bin in "$@"; do
  [[ -f "$bin" ]] || { echo "error: no such binary: $bin" >&2; exit 1; }
done

WORK="$(mktemp -d "${RUNNER_TEMP:-/tmp}/atc-sign.XXXXXX")"
KEYCHAIN="${WORK}/atc-codesign.keychain-db"
KEYCHAIN_PASS="$(openssl rand -base64 32)"
cleanup() {
  security delete-keychain "$KEYCHAIN" 2>/dev/null || true
  rm -rf "$WORK"
}
trap cleanup EXIT

printf '%s' "$LINK" | tr -d ' \n\r' | /usr/bin/base64 -D -o "${WORK}/cert.p12"
[[ -s "${WORK}/cert.p12" ]] || { echo "error: MACOS_CSC_LINK did not decode to a certificate" >&2; exit 1; }

security create-keychain -p "$KEYCHAIN_PASS" "$KEYCHAIN"
security set-keychain-settings -lut 3600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASS" "$KEYCHAIN"
security import "${WORK}/cert.p12" -k "$KEYCHAIN" -P "$PASS" -T /usr/bin/codesign -T /usr/bin/security
security set-key-partition-list -S "apple-tool:,apple:,codesign:" -s -k "$KEYCHAIN_PASS" "$KEYCHAIN" >/dev/null
security list-keychain -d user -s "$KEYCHAIN" "${HOME}/Library/Keychains/login.keychain-db"

IDENTITY="${MACOS_CSC_NAME:-}"
if [[ -z "$IDENTITY" ]]; then
  IDENTITY="$(security find-identity -p codesigning -v "$KEYCHAIN" | awk -F'"' '/Developer ID Application/ { print $2; exit }')"
fi
[[ -n "$IDENTITY" ]] || { echo "error: no Developer ID Application identity in the certificate" >&2; exit 1; }
echo "identity: $IDENTITY"

for bin in "$@"; do
  echo "signing: $bin"
  /usr/bin/xattr -cr "$bin" 2>/dev/null || true
  # --force replaces the ad-hoc signature build-binaries.mjs left (Bun's own one is stale after compiling).
  /usr/bin/codesign --force --options runtime --timestamp --sign "$IDENTITY" --entitlements "$ENTITLEMENTS" "$bin"
  /usr/bin/codesign --verify --strict --verbose=2 "$bin"
done
echo "codesign: ok"
