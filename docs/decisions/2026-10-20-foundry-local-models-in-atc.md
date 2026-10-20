---
date: 2026-10-20
title: "Download and run Foundry Local models in atc"
---

# 2026-10-20 — Download and run Foundry Local models in atc

- **Context:** the core runs Foundry Local variants (`model.yml` with a `foundry_local` block, one host
  per model) and prepares its accelerators (`/runtimes/foundry-local/accelerators[/prepare]`), but it
  downloads no model and has no route that removes one — in the app the extension does both. `atc` could
  install the engine and nothing more. OpenSpec change `add-cli-engine-parity`, design D9 and D10.
- **Decision:**
  - **Accelerators** (`foundry.accelerators`, `foundry.prepare`, `atc engines accelerators foundry-local`):
    the prepare runs in the server with no time limit (it can download about 2 GB) and is followed by the
    core's `foundry-local:accelerators` events; `atc engines install foundry-local` prepares every
    unprepared accelerator that has an execution provider unless `--no-accelerators`.
  - **Finding models:** conf's curated list (cached as `<atc>/cache/foundry-local-models.json` for an
    hour, the last copy when conf cannot be reached, `ATC_FOUNDRY_LOCAL_MODELS_URL` to override) first,
    then the chat models of Microsoft's catalog, each variant for this platform with the core's verdict.
  - **`FoundryModelSetups`, a durable job like the managed one** (`foundry.plan|install|cancel`): the
    variant named, else by `--device`, else NPU → GPU → CPU; a download only on the verdict `ok`; the
    resolver's regions in order; files from conf's list, or Azure Blob's listing for a catalog model;
    into `<data>/foundry-local/models/<variant>/`. On HTTP 403 (an expired SAS link) it resolves again,
    at most three times, and continues the partial files: a download item carries a `resume_key` that
    outlives its URL.
  - **`chat_template.jinja` is repaired once, at download** (a port of the app's `foundry_template.rs`:
    a template that reads `x['function']` also takes a tool call without the wrapper; a marker keeps it
    idempotent), before `model.yml` is written last. The app repairs before every load; in `atc` only
    `atc` writes the data folder, so once is enough and a load reads the file as it is.
  - **Removal is the client's:** `models.remove` of a variant unloads it if loaded, then deletes its
    folder inside the Foundry Local root (the core's `ModelRegistry`, which refuses a path outside it).
    `models.installed` lists variants with their device and accelerator; `atc run <variant>` loads with
    `foundry-local` without `--engine`.
  - **atc's `proxy.*` reaches engine-build installs and Foundry downloads**, as it reached model downloads.
- **Consequences:** a Foundry model behaves like every other `atc` download (visible in the snapshot,
  cancelled, continued with the same request id). A template that changes upstream after the download is
  not re-repaired until the variant is downloaded again. Microsoft's required telemetry event from the
  library stays as the core documents it.
- **Alternatives:** repair the template before each load as the app does — needs a hook in the core's
  load path for a file only `atc` writes; ask the core to download — the core downloads no models (ADR
  2026-10-15 "atc downloads its own models"); strip the query from every URL for resume — wrong for hosts
  whose query names the file.
- **Owner:** `team`.
- **Links:** `src/workspace-service/foundry-*.ts`, `src/commands/foundry-commands.ts`,
  `test/e2e/foundry-local.test.ts`; rulings 6.1–6.5 in `atomic-chat-spec/…/add-cli-engine-parity/rulings/cli.md`.
