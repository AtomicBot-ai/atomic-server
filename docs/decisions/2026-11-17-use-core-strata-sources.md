---
date: 2026-11-17
title: "Read Strata sources through the embedded core and workspace"
---

# 2026-11-17 — Read Strata sources through the embedded core and workspace

- **Context.** Atomic Server embeds the core. The engine manifest belongs to the core, and the server reads the model catalog to plan model downloads.
- **Decision.** Pin the released core 0.24.0. Pass the server environment through to the core, including `ATOMIC_STRATA_MANIFEST_URL`. Use `ATOMIC_MODEL_CATALOG_URL` as the workspace fallback when `ATC_MODEL_CATALOG_URL` is unset, so a single setting can point both readers at a local catalog.
- **Consequences.** Existing workspace overrides keep their precedence. Both overrides accept absolute file URLs at server startup.
- **Alternative.** Making the core's catalog variable override the workspace variable would silently redirect servers with an explicit workspace catalog.
