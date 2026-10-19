---
date: 2026-10-19
title: "Keep media where the core lists it"
---

# 2026-10-19 — Keep media where the core lists it

- **Context:** `atc` downloaded image and video models into `workspace-models/<category>/<id>` and
  loaded them by absolute path. The core lists, deletes and the desktop app downloads diffusion files in
  `diffusion/models` only (`diffusion.modelsDir`), so `media.files` never showed what `atc` installed.
- **Decision:** New image and video downloads go to `diffusion/models/<id>/<role>/<file>`. On start the
  daemon moves folders an earlier `atc` left in `workspace-models/{image,video}` there, partials and
  sidecars included, then rewrites the media records from what is on disk; a family the destination
  already has stays where it was, and the log says so. Writers are serialised per destination folder.
  Decision, embedding and MLX files stay in `workspace-models`.
- **Consequences:** The core lists `atc`'s media. Until the core skips download sidecars in
  `listModelFiles` (a core fix, planned), a download in progress shows its `.url`/`.ranges` files there,
  as the desktop app's do. A file deleted through the core leaves the `atc` record saying `ready`.
- **Alternatives:** Filter the sidecars in `atc` — rejected: the bug is the core's and the desktop app
  has it too.
- **Owner:** `team`.
- **Links:** `src/workspace-service/media-migration.ts`, `src/workspace-service/artifact-plan.ts`; core
  `src/diffusion/install.ts`, `src/config/paths.ts`.
