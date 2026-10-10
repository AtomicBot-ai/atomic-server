---
date: 2026-10-09
title: "Build natively, sign, then smoke the draft before publishing"
---

# 2026-10-09 — Build natively, sign, then smoke the draft before publishing

- **Context:** The release cross-compiled all binaries on one Linux runner and ran only the Linux x64 one
  (`--version`); the binaries the CI matrix tested were thrown away. Nothing was signed: on macOS the
  binaries even carried invalid signatures from Bun (the x64 one Bun's own Developer ID). `SHA256SUMS` was
  the only integrity check and nothing attested where the files came from. Actions were pinned by tag.
- **Decision:** atomic-agent's scheme, adapted. Each target is built on its runner and the e2e runs on
  that very file. macOS: Developer ID with the hardened runtime and Bun's documented entitlements, then
  notarisation with an API key (no staple: a bare binary). Windows: DigiCert KeyLocker and signtool, every
  exit code checked. `SHA256SUMS` is computed after signing; every binary gets a provenance attestation. A
  draft release is smoke-tested on each runner through the real installer before it is published. Missing
  secrets fail the run (atomic-agent skips silently); a dry run on a branch may opt out and is never
  published. Release builds label the core's error reports `production`/`prerelease`. Actions are pinned
  to commits, with Dependabot.
- **Consequences:** Releases need the Apple and DigiCert secrets before the first tag. A release takes
  longer (notarisation waits on Apple). The ad-hoc signature `build-binaries.mjs` applies on a Mac makes
  local and CI darwin binaries verify; the hardened runtime with the entitlements was checked locally on
  arm64 (start, status, stop). Not yet run end to end: the signing and notarisation steps need the
  secrets, and `spctl --assess` on a bare notarised binary is to be confirmed on the first rc.
- **Alternatives:** Cross-compile on Linux and sign afterwards: the shipped file is never the tested one.
  Staple via a `.pkg` or `.dmg`: an installer format nobody asked for. Signing only `SHA256SUMS` (GPG,
  minisign): a key to manage, and the OS still warns about an unsigned binary.
- **Owner:** `team`.
- **Links:** `.github/workflows/release.yml`, `scripts/sign-mac-binary.sh`,
  `scripts/notarize-mac-binary.sh`, `scripts/entitlements.mac.plist`, `scripts/sign-windows-binary.ps1`,
  `scripts/build-binaries.mjs`, `.github/dependabot.yml`; atomic-agent's `release.yml` and scripts.
