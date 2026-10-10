#!/usr/bin/env bash
# Notarize signed Mach-O binaries with an App Store Connect API key (adapted from atomic-agent).
#
#   scripts/notarize-mac-binary.sh <binary>...
#
# Env:
#   NOTARYTOOL_KEY       path to the API key (.p8)
#   NOTARYTOOL_KEY_ID    its key id
#   NOTARYTOOL_ISSUER    the issuer id
#   ATC_ALLOW_UNSIGNED=1 skip, with a warning, when the key is not configured (dry runs only)
#
# A bare executable cannot be stapled: the zip is only the upload, and Gatekeeper checks the ticket
# online on first run. A submission Apple does not accept fails the script with its log.

set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "usage: $0 <binary>..." >&2
  exit 2
fi
if [[ -z "${NOTARYTOOL_KEY:-}" || -z "${NOTARYTOOL_KEY_ID:-}" || -z "${NOTARYTOOL_ISSUER:-}" ]]; then
  if [[ "${ATC_ALLOW_UNSIGNED:-0}" == "1" ]]; then
    echo "warning: NOTARYTOOL_KEY / NOTARYTOOL_KEY_ID / NOTARYTOOL_ISSUER not set; not notarizing" >&2
    exit 0
  fi
  echo "error: NOTARYTOOL_KEY, NOTARYTOOL_KEY_ID and NOTARYTOOL_ISSUER are required to notarize a release" >&2
  exit 1
fi

WORK="$(mktemp -d "${RUNNER_TEMP:-/tmp}/atc-notarize.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT

for bin in "$@"; do
  zip="${WORK}/$(basename "$bin").zip"
  /usr/bin/ditto -c -k --sequesterRsrc --keepParent "$bin" "$zip"
  echo "notarizing: $bin"
  result="$(xcrun notarytool submit "$zip" --key "$NOTARYTOOL_KEY" --key-id "$NOTARYTOOL_KEY_ID" \
    --issuer "$NOTARYTOOL_ISSUER" --wait --output-format json)"
  status="$(printf '%s' "$result" | /usr/bin/plutil -extract status raw -o - - 2>/dev/null || true)"
  id="$(printf '%s' "$result" | /usr/bin/plutil -extract id raw -o - - 2>/dev/null || true)"
  if [[ "$status" != "Accepted" ]]; then
    echo "error: notarization of $bin ended as '${status:-unknown}'" >&2
    if [[ -n "$id" ]]; then
      xcrun notarytool log "$id" --key "$NOTARYTOOL_KEY" --key-id "$NOTARYTOOL_KEY_ID" --issuer "$NOTARYTOOL_ISSUER" >&2 || true
    fi
    exit 1
  fi
  echo "notarized: $bin ($id)"
done
