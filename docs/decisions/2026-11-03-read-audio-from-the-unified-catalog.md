---
date: 2026-11-03
title: "Read audio models from the unified catalog"
---

# 2026-11-03 — Read audio models from the unified catalog

- **Context:** Audio shipped reading conf's `models/audio.json` through `fetchConfList`, with its own bundled copy, cache file and `ATC_AUDIO_MODELS_URL`, because audio was not in the unified catalog yet. Since atomic-chat-conf#45 and #46, `models/catalog.json` is the only editable catalog, its `audio` collection carries the four models with an `icon` key and shorter descriptions, and `models/audio.json` is a generated export kept for released clients. The desktop app made the same move (Atomic-Chat a2c82657e) and shows each model's maker and one line in its picker (ae494232d).
- **Decision:** `models.catalog` with `category: audio` projects the unified catalog's `audio` collection through `unified-catalog.ts`, like every other category, and filters it with `parseAudioCatalog`. `audio-catalog-baseline.json`, the `workspace-audio.json` cache and `ATC_AUDIO_MODELS_URL` are gone; `ATC_MODEL_CATALOG_URL` names another catalog for audio too. An audio plan keeps the catalog's `icon` (a malformed key is dropped) and `description` in `audio`, and the web studio and its model picker draw the maker's mark and that line from the plan on disk.
- **Consequences:** One fetch and one cache serve all categories; serving the bundled snapshot now reports its error like the other categories. Plans made before this change have no `icon` or `description`: their mark falls back to the name's family (Qwen, Stable Audio) or the Hugging Face mark. The OpenMOSS and ACE-Step marks are bundled under `public/model-brands/`. A server download resumes only a partial whose recorded URL, which carries the pinned commit, matches, and each job keeps its own plan, so the desktop's same-plan resume fix (7112f29a8) needs no counterpart here.
- **Alternatives:** Keeping `ATC_AUDIO_MODELS_URL` for a standalone list would keep reading a deprecated export. Looking up logos in the catalog at draw time would need the network or cache for a model already on disk.
- **Owner:** team.
- **Links:** atomic-chat-conf#45, atomic-chat-conf#46, Atomic-Chat a2c82657e, ae494232d, 7112f29a8, `src/workspace-service/audio/audio-catalog.ts`, `src/workspace-service/models/audio-plan.ts`, `packages/admin-ui/src/workspace/media/MediaModelPicker.tsx`.

<!--
Supersedes: the catalog clause of 2026-11-01-add-audio-cpp-before-the-core-pin.md
-->
