---
date: 2026-10-19
title: "The core applies engine builds"
---

# 2026-10-19 — The core applies engine builds

- **Context:** The setup wizard installed a llama.cpp build with `POST /backends/:p/install` and made it
  active with `PATCH /settings/:p {version_backend}`; `finish()` wrote the setting again; a fresh engine
  got `recommended ?? available[0]` from the catalog; engine kinds were hard-coded lists that missed
  `sglang`. The core has done all of this since the `unify-engine-lifecycle` change: `/engines/:e/update`
  installs and activates, `.../activate` activates, both write `version_backend` in the load queue's turn,
  unload the provider's sessions, emit `engine:changed` and hold the provider's operation slot;
  `/engines/versions` names `latest` and `active`; `ENGINE_KINDS` says which system installs an engine.
  The desktop app already goes only through these (its ADR 2026-10-08).
- **Decision:** `atc` never writes `version_backend`. The picker and `finish()` call `update` or
  `activate`; a fresh install takes the core's `latest` and installs nothing when the core offers none;
  dispatch is by `ENGINE_KINDS`. `settings.update` refuses `version_backend` and the admin's settings form
  no longer shows it. A load still installs only when no build is on disk, since the core then runs the
  best installed one.
- **Consequences:** Choosing a build unloads that provider's running models, as in the desktop app. New
  engine kinds from the core (Foundry Local on 0.18) are routed without a list to update here.
- **Alternatives:** Keep the settings write and add the unload and event in `atc` — that copies core
  logic and still races the operation slot.
- **Owner:** `team`.
- **Links:** `src/workspace-service/engine-install.ts`, `src/terminal-setup/engines.ts`; core
  `src/engines/llamacpp.ts`, `src/engines/versions.ts`.
