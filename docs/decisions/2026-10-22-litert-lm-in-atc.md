---
date: 2026-10-22
title: "Install and run LiteRT-LM from atc"
---

# 2026-10-22 — Install and run LiteRT-LM from atc

- **Context:** the core 0.19 adds `litert-lm` (change `add-litert-lm-runtime`): Google's `.litertlm`
  models on the CPU, the GPU and an Intel NPU, run by a host the core starts as `<this program>
  litert-host …`, with an `openvino` accelerator on Windows NPUs and a `check` route. Model files are
  the client's to download, as for Foundry Local; conf publishes a curated list and the rules for the
  Hugging Face models shown after it (spec `litert-lm-server`, `litert-lm-models`).
- **Decision:**
  - `src/bin.ts` hands `atc litert-host …` to `@atomic-chat/core/litert-host` before atc parses a
    command, through one table of host modes beside `foundry-host`.
  - `atc engines install litert-lm` installs through the core and then prepares `openvino` where the
    core offers it (`--no-accelerators` skips); `atc engines accelerators litert-lm [--prepare]` follows
    `litert-lm:accelerators`. Foundry Local and LiteRT-LM share one server class for a prepare
    (`EngineAccelerators`) and one follower. An engine of builds the core does not offer here
    (`POST /engines/versions`) is "not available on this platform" before any install.
  - conf's lists share one cached reader (`conf-list.ts`: an hour, the last accepted copy, the bundled
    release). `atc models catalog --engine litert-lm` shows conf's models only; `search` then the Hub's
    repositories of conf's organisations tagged `litert-lm`, unverified, with variants by file name.
  - `atc models pull --engine litert-lm` is a durable job (`litert.plan|install|cancel`): the variant
    NPU → GPU → CPU, a gated repository refused without `HF_TOKEN` before a byte is written, resume and
    sha256, the token on requests to the Hub's origin only (redirects followed hop by hop, so a CDN on
    another domain never sees it), the core's check by path, `model.yml` last through the core's
    `serializeModelYml`. A refused download or file leaves no folder.
- **Consequences:** a second host mode costs one table row; the downloader gained `wrapFetch` (a fetch
  for one call), not a second allowed root — the files live in the data folder. The file-name rules
  for Hugging Face repeat the spec in atc; the app's copy must be checked against the same names. An
  unknown chip suffix reads as a CPU file until the core's check of the downloaded file refuses it.
- **Alternatives:** the downloader's `headers` with the token, as for managed checkpoints — leaves the
  CDN hop to the runtime's fetch, which the Bun binary does not promise to strip; a repository-prefix
  rule for "a file without a suffix" — loses repositories with several quantisations; a separate
  accelerator class per engine — the same 90 lines twice.
- **Owner:** `team`.
- **Links:** `src/commands/litert-commands.ts`, `src/workspace-service/litert-*.ts`,
  `src/workspace-service/hub-fetch.ts`, `atomic-chat-spec/openspec/changes/add-litert-lm-runtime`
  (`rulings/cli.md`).
