---
date: 2026-10-15
title: "atc downloads its own models"
---

# 2026-10-15 — atc downloads its own models

- **Context:** Up to core 0.16, `atc` downloaded models two ways: GGUF setups ran inside the core
  (`/models/setup-plan`, `/model-setups/*`, records in `<data>/atomic-core/prism-setups/`), and media and
  MLX models used the core's `Downloader` through the `@atomic-chat/core/downloads` export, with four
  parallel ranges (`downloadStreams`). Core 0.17.0 removes all of that (OpenSpec change
  `remove-model-downloads-from-core`; core ADR `2026-10-15-core-does-not-download-models`): clients
  download model files, the core installs engine builds and judges compatibility. The core's
  parallel-range path also needed twice the file's size on disk at its peak and could leave
  `.segments/` behind after a cancel.
- **Decision:** `atc` has its own downloader in `src/downloads/` and runs GGUF setups itself, in the
  server's workspace (`src/workspace-service/model-setups.ts`, records in `<atc>/model-setups/`).
  - The downloader is lifted from core 0.17.0 (`.tmp`/`.url` sidecars, retries, size and sha256,
    free-space preflight, Windows path limit, the raw-socket proxy client) with provenance headers. Up to
    four ranges of a hash-pinned file of 32 MiB and more are written at their own offsets in the one
    `.tmp`, their progress in `<file>.ranges`; nothing is joined, so the disk never holds two copies. The
    file is verified before it is renamed, so a cancel during hashing keeps every byte.
  - A setup plans from what the core already serves: `GET /models/atomic-prism/families`,
    `POST /models/compatibility` (`inspect_remote`), the Hub's file listing for files no family pins,
    `POST /backends/atomic-prism/catalog` and free space. It installs a PrismML build with
    `POST /backends/atomic-prism/install`, activates it with
    `POST /engines/atomic-prism/builds/:version/:variant/activate`, downloads, writes `model.yml`, then
    asks `POST /models/compatibility` by `model_id`; a file the core does not accept is removed.
  - `models.plan`, `models.install`, `setup.status`, `setup.resume` and `setup.cancel` keep their names,
    inputs and record shapes, now answered by `atc`. The terminal wizard calls them through the
    workspace instead of the core. Model progress is the downloader's `snapshot()`; the core snapshot's
    `downloads` are engine builds only.
  - Downloads run only in the server process: without the web admin, a terminal or CLI process refuses
    `models.install` and `setup.resume` as it already refused media installs.
  - The `proxy.*` config now applies to model downloads.
- **Consequences:** A `setup.json` written for core-run setups (version 1) reads as one to start again;
  resuming plans it again under the same request ids, and the partial `.tmp` of the same URL is
  continued. Setup ids of the core's records are not continued. The lifted code must follow core fixes
  by hand; the proxy client is the largest piece (three files).
- **Alternatives:** Keep the setup records in the terminal process — downloads would die with the
  terminal, and two terminals could write one file. Request a downloader export from the core — that is
  the export this change removes, so model downloads would come back to the core through it. Join
  range parts after download, as before — twice the disk at the peak.
- **Owner:** `team`.
- **Links:** `src/downloads/`, `src/workspace-service/model-setups.ts`, `src/workspace-service/gguf-plan.ts`,
  `src/terminal-setup/service.ts`; `../atomic-chat-spec/openspec/changes/remove-model-downloads-from-core/`.

<!--
Supersedes: 2026-10-08-gate-terminal-entry-on-real-model-setup.md (only "The core owns all downloads,
verification, model registration" and its four range streams; the gate itself stands)
-->
