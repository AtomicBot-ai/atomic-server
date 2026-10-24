# Releasing

One command tags a release; the pushed tag builds every binary and the Linux packages, checksums them,
publishes a GitHub release with the installers as assets, and then brings the apt/dnf repository
(`https://atc-packages.fsn1.your-objectstorage.com`) and the AUR package `atc-bin` up to it. A published version is never replaced.

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
   native binary: the uploaded file is the tested file. `ATC_SENTRY_ENVIRONMENT` labels the core's and atc's
   error reports `production` or `prerelease`; the `ATC_SENTRY_DSN` secret names atc's own Sentry
   project (without it the binary sends no atc reports).
4. **sign-macos** — `scripts/sign-mac-binary.sh` (Developer ID from a temporary keychain, hardened runtime,
   `scripts/entitlements.mac.plist`, timestamp) and `scripts/notarize-mac-binary.sh` (notarytool with the
   App Store Connect API key, `--wait`, the log on rejection). A bare binary cannot be stapled; Gatekeeper
   checks the ticket online on first run.
5. **sign-windows** — `scripts/sign-windows-binary.ps1`: DigiCert KeyLocker (`smctl`), then `signtool sign`
   with a DigiCert timestamp and `signtool verify /pa`, for the x64 and arm64 executables.
6. **packages** — the deb and rpm of the Linux binaries `build` uploaded (`scripts/linux-packages.mjs`,
   `packaging/nfpm.yaml`, nfpm pinned by checksum): x64 packages carry the baseline build, arm64 the glibc
   build. Each package depends on the glibc its binary requires, read from the binary (`readelf`). The job
   signs the rpm with the packages key (after checking the secret is the key in `packaging/atomic-chat.asc`)
   and checks the signatures. See [Linux packages](#linux-packages-and-the-repository).
7. **draft** — names the assets, writes `SHA256SUMS` **after** signing (over the binaries, the packages,
   the installers and the license files), attests build provenance for every binary and package (`gh
   attestation verify <file> -R AtomicBot-ai/eye-cli` checks it), attaches `LICENSE`, `NOTICE`,
   `THIRD_PARTY_NOTICES.md`, and creates a draft release.
8. **smoke** — on each native runner: downloads the draft's assets, serves them on loopback, installs with
   the real installer (`ATC_DOWNLOAD_BASE`), checks `--version`, starts, queries and stops a server, and
   checks the signatures (`codesign --verify`, the team id, `spctl --assess`; `Get-AuthenticodeSignature`
   is `Valid`). The musl builds run in Alpine, the baseline build and the Intel macOS build (Rosetta) run
   `--version`.
9. **smoke-packages** — in clean containers (Debian 12, Ubuntu 24.04, Fedora 44, Rocky 9 on x64; Debian 12
   and Fedora 44 on arm64; Arch on x64): a repository built from the draft's packages is served on
   loopback, signed with a throwaway key, and the README's own install commands (`<!-- install:apt -->`,
   `<!-- install:dnf -->`) add it and install `atc`; Arch builds the AUR PKGBUILD against the draft's
   files. `scripts/smoke-linux-package.sh` then checks the version, the install-source marker, that `atc
   update` refuses and names the package manager, the completions, a server that starts and stops, and
   that removing the package removes `/usr/bin/atc`.
10. **publish** — the draft becomes the release (`--latest`, or `--prerelease`).
11. **linux-repo** — stable releases from a tag only: calls `.github/workflows/linux-repo.yml`, below.

### After publishing: the repository and the AUR (`.github/workflows/linux-repo.yml`)

The apt/dnf repository and the AUR package follow **published** releases, however they were published:
`release.yml` calls this workflow after its `publish` (a release published with `GITHUB_TOKEN` starts no
other workflow), a release published by a person (the GitHub UI, `gh release edit --draft=false`) starts
it through `release: published`, and it runs by hand on a tag (`gh workflow run linux-repo.yml --ref
vX.Y.Z`; the `packages` environment admits tags only). Drafts, pre-releases and releases without packages
change nothing.

1. **release** — resolves the tag and whether it qualifies.
2. **repo** — rebuilds the repository from the newest ten published stable releases' packages, signs it
   and mirrors it to the Hetzner Object Storage bucket `atc-packages` in `fsn1`, each file `public-read` (environment
   `packages`; one run at a time). **smoke-repo** then installs from it in Debian and Fedora with the
   README's commands.
3. **aur** — renders `packaging/PKGBUILD.in` with the release's checksums and pushes it to the AUR as
   `atc-bin` (KSXGitHub/github-actions-deploy-aur, which builds it first). Only the latest release goes
   there, so publishing an older one later never downgrades it; a version the AUR already has is skipped.

These are the only steps that run after a release is public (they download its assets by their public
URLs), and each is safe to re-run: `repo` rebuilds the same repository from scratch, `aur` skips a version
already pushed.

Secrets (the names atomic-agent uses): `MACOS_CSC_LINK`, `MACOS_CSC_KEY_PASSWORD`, optional
`MACOS_CSC_NAME`, `NOTARYTOOL_KEY` (the `.p8` contents), `NOTARYTOOL_KEY_ID`, `NOTARYTOOL_ISSUER`;
`SM_API_KEY`, `SM_CLIENT_CERT_FILE_B64`, `SM_CLIENT_CERT_PASSWORD`, `SM_CODE_SIGNING_CERT_SHA1_HASH`;
`LINUX_PACKAGES_GPG_KEY` (the armored private packages key) and `LINUX_PACKAGES_GPG_PASSPHRASE`. In the
environment `packages` (deployment tags `v*` only): `PACKAGES_S3_ACCESS_KEY_ID`, `PACKAGES_S3_SECRET_ACCESS_KEY`
(Hetzner Object Storage S3 credentials) and `AUR_SSH_PRIVATE_KEY` (the key registered on the AUR
account). A missing secret fails the run. Only a run by hand on a branch with `allow_unsigned` skips signing; its
draft is never published. Actions are pinned to commits; Dependabot (`.github/dependabot.yml`) moves them.

## Assets

| Asset | From |
| --- | --- |
| `atc-<version>-<triple>[.exe]` × 10 | `dist/bin/atc-<triple>` renamed with the version. The table is `scripts/targets.mjs` (mirrored by `src/update/targets.ts`, a test keeps them equal): macOS arm64 and x64; Linux x64 and arm64 on glibc, the same on musl (`…-unknown-linux-musl`, Alpine), and x64 for CPUs without AVX2 (`…-unknown-linux-gnu-baseline`); Windows x64, x64 baseline (`…-pc-windows-msvc-baseline.exe`) and arm64. |
| `atc_<version>_<amd64\|arm64>.deb`, `atc_<version>_<x86_64\|aarch64>.rpm` | `dist/pkg/`, from the `packages` job. Named `atc_…` so no `atc-*` glob (the workflow's count of binaries, the installers) picks them up. |
| `SHA256SUMS` | `sha256sum` over the renamed binaries, the packages, the installers and the license files. The installers and the updater verify against it; the AUR PKGBUILD pins its checksums from it. |
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

## Linux packages and the repository

A package installs the release binary as `/usr/bin/atc`, the bash, zsh and fish completions, the license
files under `/usr/share/licenses/atc/`, and `/usr/lib/atc/install-source` holding `deb`, `rpm` or `aur`.
That marker, together with the binary being `/usr/bin/atc`, is what makes `atc update` leave the update to
the package manager (`src/update/install-source.ts`): renaming over a file dpkg or rpm owns would make
their database disagree with the disk. An `install.sh` copy elsewhere on the same machine stays
self-updating; `install.sh` warns that it shadows the package. After an upgrade a running server keeps
the old binary until `atc restart` (the package's post-install script says so). No systemd unit ships in
the package: `atc service install` writes one pointing at `/usr/bin/atc`.

**The repository** (`scripts/linux-repo.mjs`, pure parts in `scripts/linux-packaging.mjs`, whose
`REPOSITORY` names the bucket and its URL) is the bucket `atc-packages` on Hetzner Object Storage in
Falkenstein; the bucket is private and every object is uploaded `public-read`, so anyone can download a
file but nobody can list or write without the keys. It is served at `https://atc-packages.fsn1.your-objectstorage.com`: Hetzner terminates HTTPS only
on its own host, so a domain of ours would need a proxy in front. GitHub Releases are the source of truth
and the bucket is a mirror rebuilt from scratch on every release: the
newest ten stable releases that carry packages, each package checked against its release's
`SHA256SUMS`. Layout: `deb/dists/stable/…` and `deb/pool/main/a/atc/` (apt; `InRelease` and `Release.gpg`
signed), `rpm/packages/` and `rpm/repodata/` (dnf; gzip metadata for RHEL 8, `repomd.xml.asc` signed, rpms
signed too), `rpm/atc.repo`, and the public key as `atomic-chat.asc` and `atomic-chat.gpg`. The upload
puts new packages first, then the indexes, then `Release`/`InRelease`/`repomd.xml` and the keys, and
deletes what dropped out of the window last, so a client never sees an index naming a missing file.
Packages are cached for a year (their names are never reused), everything else is `no-cache`. Releases
older than the window stay downloadable from GitHub as `.deb` and `.rpm`.

**The packages key** lives in `packaging/atomic-chat.asc` (public) and in `LINUX_PACKAGES_GPG_KEY`
(private, RSA 4096: EdDSA rpm signatures are not readable everywhere). The workflow refuses a secret that
is not that key. It expires after five years; extend it well before
(`gpg --quick-set-expire <fingerprint> 5y`, commit the re-exported `packaging/atomic-chat.asc`, update the
secret, release; the fingerprint stays the same): an expired key makes `apt update` fail for every user. If the private key leaks, make a
new one, publish it the same way (and its fingerprint in README.md), and tell users to re-run the README's key line; apt and dnf trust only
the keyring file the README writes.

**Testing locally** (Docker): build `dist/bin/atc-x86_64-unknown-linux-gnu-baseline` and
`dist/bin/atc-aarch64-unknown-linux-gnu`, then in a Linux container with nfpm, `dpkg-dev`, `apt-utils`,
`createrepo-c` and `gnupg`: `node scripts/linux-packages.mjs build`, a throwaway key, `node
scripts/linux-repo.mjs build --assets dist/pkg --key <fpr> --out dist/site --base-url
http://127.0.0.1:8766 --unsigned-packages`, serve `dist/site`, and run `scripts/smoke-linux-package.sh` in
a distro container sharing that network with the commands from `node scripts/linux-repo.mjs readme
--block apt|dnf --base-url http://127.0.0.1:8766`.

## Self-update

`atc update [--version x.y.z] [--force]` (`src/update/apply.ts`, `src/commands/update.ts`):

1. Finds the release (`/releases/latest`, or `/releases/tags/vX.Y.Z`; `ATC_GITHUB_API` points at a mirror
   or the e2e's stand-in). Without `--version` or `--force`, an older or equal release is a no-op.
2. Picks the asset of this binary's own triple (`ATC_TARGET`, baked in at build time), so a baseline or
   musl install stays one. A binary run from source refuses: it updates with git. So does a packaged
   install (`/usr/bin/atc` with the deb, rpm or AUR marker): the hint names `apt`, `dnf` or the AUR
   helper, and `--check` prints the same command.
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
newer core unsafe. 0.19.0 is the pin. The Foundry Local and LiteRT-LM host entries (`./foundry-host`
and `./litert-host`) run before command parsing in `src/bin.ts`, including in the compiled binary.
The core also exports the provider setting schemas
(`./settings`), `readWindowsAcl` in `./host`, and a PrismML catalog that picks the build for a file's
`requires`/`min_build`. Since 0.17.0 the core downloads no model files and exports no downloader (ADR
`2026-10-15-atc-downloads-its-own-models`). `atc` downloads every model with its own
`src/downloads/` and asks the core only for engine builds, compatibility verdicts and free space. From
0.13.6 it keeps the public API keyring (`publicApiKeys`), active engine downloads in the snapshot and a time
limit on remote GGUF reads (`remoteGgufTimeoutMs`); `startDaemon` passes both options explicitly.

```jsonc
// package.json
"dependencies": { "@atomic-chat/core": "0.19.0" }
```

To bump the core: `bun add --exact @atomic-chat/core@<version>`, run `npm run verify`, and commit the bump
(`package.json` and `bun.lock`) on its own. To develop against a local core checkout, build it there, run
`bun link` in it and `bun link @atomic-chat/core` here (only `node_modules` changes), and `bun install
--force` to go back to the pinned version. The core's `attachToOwner` refuses a version mismatch between the running daemon and the
attaching command, so a core bump is always followed by an `atc` release, and the first `atc start` after an
upgrade replaces an idle old daemon.

The core's release workflow publishes to npm when its `NPM_TOKEN` secret is set; otherwise a maintainer
publishes from a clean `main` checkout with `npm publish --access public --otp=<code>`.
