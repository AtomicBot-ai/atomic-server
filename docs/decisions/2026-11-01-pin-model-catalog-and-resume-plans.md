---
date: 2026-11-01
title: "Use the unified model catalog and persist every model commit"
---

# 2026-11-01 — Use the unified model catalog and persist every model commit

- **Context:** Independent model feeds and moving HF refs let compatibility, file metadata and resumed bytes describe different versions. A completed file of equal size alone does not identify its contents.
- **Decision:** Read one `models/catalog.json` document and project existing UI/engine shapes in memory. Cache that complete document as `atomic-model-catalog-v1.json`; retain old caches without reading or combining them. Use the same format for the bundled fallback. `ATC_MODEL_CATALOG_URL` permits local manifests for development.
- **Downloads:** Resolve a commit before compatibility or disk checks. Use the core GGUF helper's returned revision, not interception of its raw response. Plans include every shard and projector, each repository's independent commit, paths, sizes and available hashes. Media/MLX/managed plans have their own version. Resume executes the recorded plan; a legacy unfinished job without a commit is refused and partial files remain. Do not substitute main for an unavailable pin. Tokens and current proxy settings are execution inputs, never persisted credentials.
- **Integrity:** Confirm declared sizes/hashes against metadata at the selected commit before new transfers. Reuse existing files only after checking a content hash. Re-fetch files without such evidence; do not treat size as identity. Registration follows successful validation of the entire file set. Existing installed models are not updated automatically.
- **Consequences:** New jobs require metadata, while recorded jobs can resume without querying an updated catalog. The core remains a metadata/compatibility library and engine owner; atc remains the downloader. Model paths, external IDs and old schema-version-1 exports remain compatible. No runtime dependency is added. Release conf, release core and pin its exact published version before releasing clients.
- **Alternatives:** A separately edited sources file duplicates authority. Main-based Resume can combine revisions. Searching HF history during recovery is ambiguous and is not performed.
- **Owner:** team.
- **Links:** `atomic-chat-spec/openspec/changes/unify-model-catalog`; `../Atomic-Chat/docs/decisions/2026-11-01-unify-model-catalog-and-download-plans.md`.
