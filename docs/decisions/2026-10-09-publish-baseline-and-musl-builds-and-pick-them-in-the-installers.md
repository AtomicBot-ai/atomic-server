---
date: 2026-10-09
title: "Publish baseline and musl builds and pick them in the installers"
---

# 2026-10-09 — Publish baseline and musl builds and pick them in the installers

- **Context:** Six binaries were published, all glibc and all needing AVX2 on x64. On a CPU from before
  2013 `atc` died with an illegal instruction; on Alpine the installer put a glibc binary there that could
  not start; in a Rosetta shell the installer chose the x64 build. The target table was written out five
  times (build script, `assetNameFor`, three e2e files), and the installers and `atc update --check`
  pointed at `atomic-chat-cli` while releases are published from `eye-cli`. `install.sh` installed
  unverified when it had no checksum tool, and `install.ps1` overwrote the old binary before moving it.
- **Decision:** One table, `scripts/targets.mjs`, mirrored by `src/update/targets.ts` with a test keeping
  them equal: ten targets, adding Linux musl (x64, arm64) and baseline x64 (Linux, Windows). Each binary
  bakes in its triple (`__ATC_TARGET__`) so an update fetches the same variant. The installers detect
  musl, AVX2 (`/proc/cpuinfo`, `IsProcessorFeaturePresent`) and Rosetta, refuse what they cannot verify,
  and replace atomically (Windows: move aside, write, roll back on failure). The repository is
  `AtomicBot-ai/eye-cli` everywhere; the data folder keeps its `atomic-chat-cli` name. darwin builds are
  re-signed ad hoc on a Mac. The installers are tested end to end against a loopback release with a faked
  machine (`test/installers/`).
- **Consequences:** Ten assets per release. No darwin baseline (macOS that still runs on a pre-AVX2 Mac is
  past its support) and no musl baseline. `ATC_DOWNLOAD_BASE` and `ATC_CPUINFO` are seams for tests and
  mirrors, not documented for people.
- **Alternatives:** Baseline only (one x64 build for all): slower on every modern CPU. Detect the CPU in
  `atc` itself and re-exec: the binary that cannot start cannot detect anything.
- **Owner:** `team`.
- **Links:** `scripts/targets.mjs`, `src/update/targets.ts`, `scripts/build-binaries.mjs`,
  `scripts/install.sh`, `scripts/install.ps1`, `test/installers/`, `.github/workflows/ci.yml`.
