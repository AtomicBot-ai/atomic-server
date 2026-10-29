# B06 — Searching a catalog model by its displayed title loses the matching result

- **Status:** Fixed — verified by regression tests in this change. See the [fix validation session](../sessions/2026-10-29-fixes.md).
- **Priority:** P2.
- **First observed:** [2026-10-29, pass 01](../sessions/2026-10-29-pass-01.md).
- **Reproduction evidence:** confirmed in two independent tabs against the live catalog.
- **Environment:** Atomic Server 0.2.8, core 0.19.1, product commit `41cc1f776e31`, admin build `8c7fb29570b81ff1`; macOS 26.6.2 arm64, Apple M4 Max, 48 GiB; Codex in-app browser.

## Reproduce

1. Open Models > Catalog with default GGUF settings.
2. Confirm that LFM2 1.2B is present.
3. Type exactly LFM2 1.2B in Search for models.
4. Wait for the debounced remote search to finish.
5. Clear the search.

## Expected

A known catalog entry matching its displayed title remains discoverable.

## Observed and impact

The matching row first appears, then disappears and the page says No models match these filters. Clearing search restores the entry.

## Mechanism

Remote search replaces the curated catalog wholesale. The known matching curated entry is lost when the remote search has no match for the displayed title.

## Source pointers

- [packages/admin-ui/src/workspace/library/catalog/Catalog.tsx:124](../../../packages/admin-ui/src/workspace/library/catalog/Catalog.tsx#L124)

## Evidence

- [catalog-search-loses-match.png](../evidence/2026-10-29-pass-01/catalog-search-loses-match.png)
- [catalog-search-repeat.png](../evidence/2026-10-29-pass-01/catalog-search-repeat.png)

## Resolution

No fix applied. A fix needs a linked change and a new verification session before this finding is marked verified fixed.

## Local fix verification

The original discovery status was: Open — confirmed.

The implementation is in [catalog-search.ts](../../../src/workspace-service/models/catalog-search.ts); supporting changes, regression tests, browser/API evidence and verification limits are recorded in the [fix validation session](../sessions/2026-10-29-fixes.md). The original evidence above describes the unfixed build and is retained.
