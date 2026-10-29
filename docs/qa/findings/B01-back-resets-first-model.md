# B01 — Back resets the selected first model to a different recommendation

- **Status:** Fixed — verified by regression tests in this change. See the [fix validation session](../sessions/2026-10-29-fixes.md).
- **Priority:** P2.
- **First observed:** [2026-10-29, pass 01](../sessions/2026-10-29-pass-01.md).
- **Reproduction evidence:** confirmed twice during actual model download.
- **Environment:** Atomic Server 0.2.8, core 0.19.1, product commit `41cc1f776e31`, admin build `8c7fb29570b81ff1`; macOS 26.6.2 arm64, Apple M4 Max, 48 GiB; Codex in-app browser.

## Reproduce

1. On fresh onboarding choose llama.cpp.
2. Select LFM2.5 1.2B instead of the first recommendation and press Continue.
3. On Permissions press Back.

## Expected

Returning to the choice preserves the selected model.

## Observed and impact

Qwen3.8 27B is selected; LFM2.5 1.2B is deselected, even while its download continues. Continue now targets a different and much larger model.

## Mechanism

FirstModel is remounted and initializes selection from the first local/catalog entry; the wizard does not retain the original selection.

## Source pointers

- [packages/admin-ui/src/workspace/setup/FirstModel.tsx:87](../../../packages/admin-ui/src/workspace/setup/FirstModel.tsx#L87)

## Evidence

- [back-resets-selection.png](../evidence/2026-10-29-pass-01/back-resets-selection.png)

## Resolution

No fix applied. A fix needs a linked change and a new verification session before this finding is marked verified fixed.

## Local fix verification

The original discovery status was: Open — confirmed.

The implementation is in [FirstModel.tsx](../../../packages/admin-ui/src/workspace/setup/FirstModel.tsx); supporting changes, regression tests, browser/API evidence and verification limits are recorded in the [fix validation session](../sessions/2026-10-29-fixes.md). The original evidence above describes the unfixed build and is retained.
