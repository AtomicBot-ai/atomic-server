# Releasing

One command tags a release; the pushed tag builds every binary, checksums them and publishes a GitHub
release with the installers as assets. A published version is never replaced.

## The command

```bash
npm run release -- patch --push        # 0.1.0 → 0.1.1, commit, tag v0.1.1, push branch + tag
npm run release -- minor               # bump and tag only; prints the push command
npm run release -- 1.2.3 --push        # an explicit version (the current one only tags HEAD)
make release                           # patch; VERSION=minor / major / X.Y.Z
```

`scripts/release.mjs` refuses a dirty tree, a version below the current one and a tag that already exists
locally or on `origin`. It rewrites the one version line in `package.json` and in `src/version.ts`
(`ATC_VERSION`; a unit test keeps the two equal), commits `release: vX.Y.Z`, creates an annotated tag and,
with `--push`, runs `git push --follow-tags origin HEAD`. Follow the run with
`gh run list --workflow release.yml`.

## What the workflow does (`.github/workflows/release.yml`)

Triggered by a `v*` tag, or by hand (`workflow_dispatch`) for the version already in `package.json` on a
branch. One run at a time (`concurrency: release`):

1. **version** — reads `package.json`, refuses a tag that does not match it and a release that already
   exists; a version with `-` (`0.1.0-rc.1`) is a pre-release.
2. **gates** — the whole of `ci.yml` (lint, typecheck, format, docs and notices checks, UI, the test matrix
   with e2e and the installers, script linters).
3. **build** — each target on its own runner (macOS arm64 builds both darwin targets; Linux x64 and arm64
   their glibc, musl and baseline builds; Windows x64 and arm64 theirs), then the e2e on that runner's
   native binary: the uploaded file is the tested file. `ATC_SENTRY_ENVIRONMENT` labels the core's error
   reports `production` or `prerelease`.
4. **sign-macos** — `scripts/sign-mac-binary.sh` (Developer ID from a temporary keychain, hardened runtime,
   `scripts/entitlements.mac.plist`, timestamp) and `scripts/notarize-mac-binary.sh` (notarytool with the
   App Store Connect API key, `--wait`, the log on rejection). A bare binary cannot be stapled; Gatekeeper
   checks the ticket online on first run.
5. **sign-windows** — `scripts/sign-windows-binary.ps1`: DigiCert KeyLocker (`smctl`), then `signtool sign`
   with a DigiCert timestamp and `signtool verify /pa`, for the x64 and arm64 executables.
6. **draft** — names the assets, writes `SHA256SUMS` **after** signing (over the binaries and the
   installers), attests build provenance for every binary (`gh attestation verify <file> -R
   AtomicBot-ai/eye-cli` checks it), attaches `LICENSE`, `NOTICE`, `THIRD_PARTY_NOTICES.md`, and creates a
   draft release.
7. **smoke** — on each native runner: downloads the draft's assets, serves them on loopback, installs with
   the real installer (`ATC_DOWNLOAD_BASE`), checks `--version`, starts, queries and stops a server, and
   checks the signatures (`codesign --verify`, the team id, `spctl --assess`; `Get-AuthenticodeSignature`
   is `Valid`). The musl builds run in Alpine, the baseline build and the Intel macOS build (Rosetta) run
   `--version`.
8. **publish** — the draft becomes the release (`--latest`, or `--prerelease`).

Secrets (the names atomic-agent uses): `MACOS_CSC_LINK`, `MACOS_CSC_KEY_PASSWORD`, optional
`MACOS_CSC_NAME`, `NOTARYTOOL_KEY` (the `.p8` contents), `NOTARYTOOL_KEY_ID`, `NOTARYTOOL_ISSUER`;
`SM_API_KEY`, `SM_CLIENT_CERT_FILE_B64`, `SM_CLIENT_CERT_PASSWORD`, `SM_CODE_SIGNING_CERT_SHA1_HASH`. A
missing secret fails the run. Only a run by hand on a branch with `allow_unsigned` skips signing; its
draft is never published. Actions are pinned to commits; Dependabot (`.github/dependabot.yml`) moves them.

## Assets

| Asset | From |
| --- | --- |
| `atc-<version>-<triple>[.exe]` × 10 | `dist/bin/atc-<triple>` renamed with the version. The table is `scripts/targets.mjs` (mirrored by `src/update/targets.ts`, a test keeps them equal): macOS arm64 and x64; Linux x64 and arm64 on glibc, the same on musl (`…-unknown-linux-musl`, Alpine), and x64 for CPUs without AVX2 (`…-unknown-linux-gnu-baseline`); Windows x64, x64 baseline (`…-pc-windows-msvc-baseline.exe`) and arm64. |
| `SHA256SUMS` | `sha256sum atc-*` over the renamed binaries. The installers and the updater verify against it. |
| `install.sh`, `install.ps1` | Copied from `scripts/`; served at `releases/latest/download/install.sh` so the one-liner in the README works. |

Binaries are built with `--production --keep-names --sourcemap` (identifiers kept, so stack traces name
functions) and `--define __ATC_GIT_SHA__ / __ATC_BUILD_DATE__ / __ATC_TARGET__`: the first two are what
`atc version` reports, the triple is how `atc update` fetches the same variant the installer chose. On a
Mac the darwin builds are re-signed ad hoc right after compiling: Bun's output carries a signature that no
longer matches once the program is embedded (the x64 one is Bun's own Developer ID).

## Installers

`scripts/install.sh` (Linux, macOS; `sh`, `curl` or `wget`) and `scripts/install.ps1` (Windows PowerShell)
pick the binary for the machine — the CPU (a 32-bit Windows is refused; a Rosetta shell gets arm64), musl
when Linux has no glibc, the baseline x64 build without AVX2 — and refuse to install anything they could
not verify (a checksum mismatch, or no `sha256sum`/`shasum`). Both take `ATC_DOWNLOAD_BASE` (a mirror; the
tests serve a release from loopback through it). `test/installers/` runs them end to end (`npm run
test:installers`); CI also runs shellcheck, PSScriptAnalyzer and actionlint. Otherwise they do the same thing: resolve the release (`ATC_VERSION=vX.Y.Z` pins one, default latest), download
`SHA256SUMS`, pick the asset matching this machine's triple, download and verify it, and install it
atomically — copy beside the target and rename over it on POSIX (never overwrite the inode a running `atc`
executes from); on Windows a running `atc.exe` is moved aside as `atc.exe.old-<stamp>` and cleaned up on
the next install. Defaults: `~/.local/bin/atc` and `%LOCALAPPDATA%\atc\atc.exe`. The install directory is
added to `PATH` (rc file with the marker `# added by atc installer`, or the user PATH on Windows) unless
`ATC_NO_PATH=1`. `ATC_INSTALL_DIR` and `ATC_REPO` override the location and the repository.

## Self-update

`atc update [--version x.y.z] [--force]` (`src/update/apply.ts`, `src/commands/update.ts`):

1. Finds the release (`/releases/latest`, or `/releases/tags/vX.Y.Z`; `ATC_GITHUB_API` points at a mirror
   or the e2e's stand-in). Without `--version` or `--force`, an older or equal release is a no-op.
2. Picks the asset of this binary's own triple (`ATC_TARGET`, baked in at build time), so a baseline or
   musl install stays one. A binary run from source refuses: it updates with git.
3. Downloads it beside the executable (same file system, so the swap is a rename), hashing as it streams,
   and compares with `SHA256SUMS`.
4. Checks the signature: never less trusted than the installed binary (`src/update/trust.ts`). A binary
   signed with a Developer ID (macOS) or Authenticode (Windows) is replaced only by one of the same team or
   signer; an unsigned or ad-hoc one accepts any intact signature. This is what stops a replaced asset
   together with a replaced `SHA256SUMS`.
5. Runs the download with `--version` and expects the release's version.
6. Swaps it in with `planReplace`: POSIX renames over the running inode; Windows moves the running file
   aside (`.old-<stamp>`, removed by a later update) and puts it back if the new one cannot be moved in.
7. Restarts what runs the old code: the OS service when one is installed, otherwise the background server
   (refused while other clients are attached, unless `--force`; the note says `atc restart --force`).

Any failure before step 6 leaves the installed binary as it was and removes the download.
`test/e2e/update.test.ts` runs the whole path on the built binary against a release served from loopback.

## Signing and notarisation

See the workflow above. Locally, `scripts/build-binaries.mjs` re-signs darwin builds ad hoc on a Mac
(Bun's output carries a signature that is invalid once the program is embedded); the release replaces it
with the Developer ID. Bun's Windows output has no certificate table, so nothing is stripped before
Authenticode. `atc update` refuses a binary less trusted than the installed one (`src/update/trust.ts`).

## The core pin

`atc` embeds the core as the npm package `@atomic-chat/core` (repo `atomic-chat-core`, published by its
release workflow) at an **exact** version, never a caret: the protocol and version checks make a silently
newer core unsafe. 0.13.6 is the first published core with what `atc` needs (0.13.3, where it landed, never passed its release gates): the public API keyring
(`publicApiKeys`), parallel model downloads (`downloadStreams`), active downloads in the snapshot, and a time
limit on remote GGUF reads (`remoteGgufTimeoutMs`) — until then `atc` ran on a private 0.11.2 build kept in
`vendor/`. `startDaemon` passes all three options explicitly.

```jsonc
// package.json
"dependencies": { "@atomic-chat/core": "0.13.6" }
```

To bump the core: `bun add --exact @atomic-chat/core@<version>`, run `npm run verify`, and commit the bump
(`package.json` and `bun.lock`) on its own. To develop against a local core checkout, build it there, run
`bun link` in it and `bun link @atomic-chat/core` here (only `node_modules` changes), and `bun install
--force` to go back to the pinned version. The core's `attachToOwner` refuses a version mismatch between the running daemon and the
attaching command, so a core bump is always followed by an `atc` release, and the first `atc start` after an
upgrade replaces an idle old daemon.

The core's release workflow publishes to npm when its `NPM_TOKEN` secret is set; otherwise a maintainer
publishes from a clean `main` checkout with `npm publish --access public --otp=<code>`.
