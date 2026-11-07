---
date: 2026-11-06
title: "Refresh variant verdicts when returning from engine setup"
---

# 2026-11-06 — Refresh variant verdicts when returning from engine setup

- **Context:** Foundry's engine panel could report an installed engine while the model catalog retained pre-install verdicts and still offered Install engine. Its footer also measured and painted three-line buttons although the shared button renderer draws one line.
- **Decision:** when closing an engine panel over a variant catalog, reread the catalog through its existing guarded loader, then restore the expanded family and selected variant if still present. Use the core's returned verdicts; installation alone does not imply accelerator compatibility. Calculate the popup footer from the same one-line button geometry used for rendering and mouse targets.
- **Consequences:** returning to the catalog incurs one fresh catalog read. Stale or failed responses cannot restore an obsolete selection. CPU can become downloadable while an unsupported accelerator remains blocked by its plan.
- **Alternatives:** changing Install to Download based on the panel's installed flag would bypass the distinction between installation and device compatibility.
- **Owner:** team.
- **Links:** `src/tui/workspace/library/engine-catalog-return.ts`, `engine-panel.ts`.
