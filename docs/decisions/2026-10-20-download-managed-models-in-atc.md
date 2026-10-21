---
date: 2026-10-20
title: "Download managed models in atc"
---

# 2026-10-20 — Download managed models in atc

- **Context:** TensorRT-LLM, vLLM and SGLang load Hugging Face safetensors checkpoints from the shared
  store the core names (`GET /managed-models/location`: `<data>/managed-models` on Linux, a
  `\\wsl.localhost\…` folder on Windows). The core judges a checkpoint (`POST /models/<engine>/check`) but
  downloads nothing (ADR 2026-10-15 "atc downloads its own models", core's "core does not download
  models"). `atc` could only download GGUF and MLX, so a managed engine had nothing to run unless someone
  copied a model into the store. OpenSpec change `add-cli-engine-parity`, design D6 and D7.
- **Decision:**
  - **The Hugging Face resolver is lifted from the desktop app** (`src/workspace-service/hf-revision.ts`,
    from `web-app/src/services/managed-models/models.ts` @ 7cd5613aa): the revision pinned to its
    commit, `config.json`, `hf_quant_config.json`, every file with size and LFS sha256, and the tensor
    names of the safetensors headers by range requests (8 at a time, numeric segments folded to `*`).
    `HF_TOKEN` of the server reaches gated repositories; `HF_ENDPOINT` names a mirror (the e2e's
    loopback Hub). The verdict is only ever the core's (`models.check`, `atc models check`).
  - **`ManagedModelSetups`, a durable job like `ArtifactService`** (`managed-model-setups.ts`): a plan
    by digest (`managed.plan`: verdict, store, free space, missing files, already there), then a job
    under the caller's request id (`managed.install`) that downloads with the server's one downloader,
    writes `model.yml` last — only after every file was verified — and asks the core to list the model
    (`GET /models/<engine>/<id>/capabilities`). A job running when the server stopped reads as
    `interrupted`; the same request id continues it from the partial files. Jobs show in the
    snapshot's `setups` and `downloads`.
  - **The downloader takes a second allowed root per call** (`allowedRoots`): the store's root as the
    core names it, checked by canonical path exactly like the data folder.
  - **`model.yml` is JSON** — YAML 1.2, which the core reads with its `yaml` parser into the same
    document the app's serde_yaml writes — so `atc` needs no YAML dependency.
  - `atc models pull <repo> --engine <managed>` (plan, follow, `--detach`, `--cancel`, `--request-id`,
    `--dry-run`), `atc models catalog|search --engine <managed>` (the descriptor's curated models; a
    safetensors search narrowed by architecture and the largest card, an exact `owner/repo` always shown),
    `atc models list` (a store model once, with every managed provider that lists it, and its size) and
    `atc models rm` through `DELETE /managed-models/<id>` with the warning that it goes for every engine.
    `atc models pull <repo>` of a repository without GGUF names the managed engines that take it.
- **Consequences:** a server downloads, resumes and removes managed models on its own, and the core sees
  them exactly as the app's. The resolver and the prefilter now exist twice (app and `atc`): a change in
  the app's `models.ts` or `hub-feed.ts` needs the same change here; the unit tests use the app's fixture
  shapes to keep them aligned. The e2e drives the built `atc` against the core's fake machine and a Hub
  on loopback.
- **Alternatives:** new core routes for resolving and downloading — a core release and a reversal of the
  core's decision not to download models. Copying into the store by hand — no verification, no resume.
  Adding the `yaml` package — a dependency for one file the core reads either way.
- **Owner:** `team`.
- **Links:** `src/workspace-service/{hf-revision,managed-models,managed-model-plan,managed-model-setups,managed-catalog,managed-store}.ts`,
  `src/commands/{managed-model-commands,installed-models}.ts`, `src/downloads/downloader.ts`,
  `test/e2e/managed-models.test.ts`.
