# B11 — MLX model search queries GGUF and removes all matching MLX entries

- **Status:** Fixed — verified by regression tests in this change. See the [fix validation session](../sessions/2026-10-29-fixes.md).
- **Priority:** P2.
- **First observed:** [2026-10-29, pass 04](../sessions/2026-10-29-pass-04.md).
- **Environment:** Atomic Server 0.2.8 / core 0.19.1, build `609ce03db0f1`, admin build `8c7fb29570b81ff1`; macOS 26.6.2 arm64; interactive Codex in-app browser; fresh real MLX installation.

## Reproduce

1. Open Models > Catalog > Filters and select Format: MLX.
2. With an empty query, confirm the catalog includes LFM2 1.2B (MLX) and LFM2.5 1.2B (MLX).
3. Search `LFM2` and wait for remote search to complete.
4. Clear the query; compare searching `Qwen`, another family visibly present in the MLX catalog.

## Expected

Search respects the selected MLX format and preserves or discovers matching MLX checkpoints.

## Observed and impact

The empty-query catalog has 37 MLX rows, including matching LFM2/Qwen entries. Both search terms end in `No models match these filters.` Clearing the query restores the models; the original LFM2.5 MLX row can start an actual checkpoint download. A full MLX repository query also produced no matches.

The MLX model discovery/install path becomes unusable as soon as a user searches. Users must browse the unfiltered list to install an already-curated model; searching external MLX repositories is also sent down the wrong format path.

## Mechanism and relation to B06

The browser sends GGUF and MLX queries through the same engine-less `models.search` operation. Its fallback `searchHub` hardcodes `filter=gguf` and returns rows without MLX format metadata. The browser replaces the MLX catalog with those rows, then filters them out as non-MLX.

This is distinct from [B06](B06-catalog-title-search-loses-match.md): B06 loses a curated GGUF display-title match when remote lookup replaces it. Here the remote lookup requests the wrong model format for MLX; merging a GGUF title match alone would not repair MLX discovery.

## Source pointers

- [MLX shares the engine-less search call](../../../packages/admin-ui/src/workspace/library/catalog/Catalog.tsx#L116).
- [Hardcoded GGUF Hub filter](../../../src/terminal-setup/catalog.ts#L15).
- [Displayed-format filter](../../../packages/admin-ui/src/workspace/library/catalog/CatalogBrowse.tsx#L119).

## Evidence

- [MLX catalog before search](../evidence/2026-10-29-pass-04/B11-MLX-catalog-present.png).
- [LFM2 search has no MLX matches](../evidence/2026-10-29-pass-04/B11-MLX-search-empty.png).
- [Repeated with Qwen](../evidence/2026-10-29-pass-04/B11-MLX-Qwen-search-empty.png).
- [Actual curated MLX entries](../evidence/2026-10-29-pass-04/B11-curated-MLX-entries.json).

## Resolution

No fix applied. A fix needs a linked change and a new verification session before this finding is marked verified fixed.

## Local fix verification

The original discovery status was: Open — confirmed for LFM2 and Qwen, with clear-search recovery.

The implementation is in [catalog-search.ts](../../../src/workspace-service/models/catalog-search.ts); supporting changes, regression tests, browser/API evidence and verification limits are recorded in the [fix validation session](../sessions/2026-10-29-fixes.md). The original evidence above describes the unfixed build and is retained.
