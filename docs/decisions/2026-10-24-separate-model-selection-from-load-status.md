---
date: 2026-10-24
title: "Separate model selection from load status"
---

# 2026-10-24 — Separate model selection from load status

- **Context:** A downloaded model and a remotely advertised model were both shown as loaded in some lists. The terminal model button also kept its old label until a new local model finished loading.
- **Decision:** Web and terminal catalog badges use one selector that matches model ID, local provider and service kind against the live snapshot. Ready local sessions show Loaded, matching active loads show Loading…, and local files without such sessions show Downloaded. Cloud routes do not count as local sessions. Catalog families retain their filename, variant and recorded repository mappings. Narrow rows retain the status when secondary table columns are hidden.
- **Decision:** Terminal selection updates the model button and returns to the composer immediately. A separate pending-load state blocks inference until readiness is verified and shows animation inside the composer. A failed load keeps the chosen model visible with Retry and View log. Newer selections invalidate older asynchronous results; serialized preference writes prevent an older save from overwriting a later selection. This changes selection feedback, not server readiness or backend load admission.
- **Consequences:** The local installed list contains local files and ready media artifacts. Remote discovery remains in the endpoint model picker. Short catalog layouts use compact controls and inline Pause/Remove when a full transfer card would not fit.
- **Validation:** Provider/kind/cloud mismatch tests, filename/repository matching, wide and narrow status rendering, cross-kind installed navigation, immediate pending state, stale success/error races, reduced-motion loading, and retry without losing the draft. Engine-triggered reloads share the same selection revision and serialized saves, so their late completion cannot restore an older model. Live snapshots preserve pending or failed local intent even if an older session for that model is still advertised as ready.
