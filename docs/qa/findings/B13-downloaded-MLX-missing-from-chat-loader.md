# B13 — A newly downloaded MLX model is missing from the chat's installed-model loader

- **Status:** Fixed — verified by regression tests in this change. See the [fix validation session](../sessions/2026-10-29-fixes.md).
- **Priority:** P2.
- **First observed:** [2026-10-29, pass 04](../sessions/2026-10-29-pass-04.md).
- **Environment:** Atomic Server 0.2.8 / core 0.19.1, build `609ce03db0f1`, admin build `8c7fb29570b81ff1`; macOS arm64; fresh MLX engine/checkpoint download, no earlier MLX registry entry.

## Reproduce

1. Install MLX and download `mlx-community/LFM2.5-1.2B-Instruct-4bit` from the MLX catalog.
2. Wait for the artifact job to be ready. Confirm the catalog's Installed on this device filter shows the model as Downloaded and offers Load model.
3. Before its first load, open Playground > Choose chat model > Installed model and engine. Close/reopen or try a second client.
4. Compare loading it from its catalog row, then reopening the chat loader.

## Expected

A fully downloaded model offered as installed/loadable in the catalog is also offered in the chat's Load an installed model list. A first load through a different page must not be required to make it discoverable there.

## Observed and impact

The ready MLX checkpoint is absent from the chat dropdown in both clients. `models.installed` lists only the two seeded GGUF models, although `artifacts.list` reports the MLX job ready and all file sizes/hash checks pass. The catalog offers MLX Load model; confirming that registers and successfully runs it. The chat dropdown then gains `mlx · LFM2.5 1.2B (MLX)`.

The user cannot go directly from a completed fresh MLX download to loading it in the chat; they must discover and use the catalog's separate load path first. Already-registered MLX models are not claimed to be affected.

## Mechanism

The chat loader reads only `models.installed`, which includes the MLX ModelRegistry. Artifact completion leaves a ready download job; `ArtifactJobs.load` writes the MLX registry entry only when first loading from the artifact/catalog route. The catalog separately merges ready artifact jobs, so the two installation views disagree.

## Source pointers

- [Chat loader reads only models.installed](../../../packages/admin-ui/src/workspace/chat/InstalledLoad.tsx#L17).
- [MLX registry entry created only on artifact load](../../../src/workspace-service/models/artifacts.ts#L230).
- [Installed-model operation reads MLX registry](../../../src/workspace-service/models/model-operations.ts#L139).

## Evidence

- [Downloaded and loadable in the catalog](../evidence/2026-10-29-pass-04/MLX-downloaded-catalog.png).
- [Missing from the chat dropdown before first load](../evidence/2026-10-29-pass-04/B13-installed-picker-options.json).
- [Ready artifact before first registration](../evidence/2026-10-29-pass-04/B13-ready-artifact.json).
- [Verified complete checkpoint files](../evidence/2026-10-29-pass-04/MLX-resume-file-verification.json).
- [Installed-model list after catalog registration](../evidence/2026-10-29-pass-04/B13-models-after-registration.json).
- [Real MLX session, worker processes and API model](../evidence/2026-10-29-pass-04/MLX-inference-ready.json).

## Resolution

No fix applied. A fix needs a linked change and a new verification session before this finding is marked verified fixed.

## Local fix verification

The original discovery status was: Open — confirmed in two browser clients before first catalog load, with a passing after-load control.

The implementation is in [mlx-registration.ts](../../../src/workspace-service/models/mlx-registration.ts); supporting changes, regression tests, browser/API evidence and verification limits are recorded in the [fix validation session](../sessions/2026-10-29-fixes.md). The original evidence above describes the unfixed build and is retained.
