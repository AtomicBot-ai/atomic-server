# B05 — Atomic Prism crashes loading tested LFM2/LFM2.5 models on Metal; CPU and upstream work

- **Status:** Open — confirmed.
- **Priority:** P2.
- **First observed:** [2026-10-29, pass 01](../sessions/2026-10-29-pass-01.md).
- **Reproduction evidence:** confirmed with a browser load, standalone engine diagnostic and CPU control.
- **Environment:** Atomic Server 0.2.8, core 0.19.1, product commit `41cc1f776e31`, admin build `8c7fb29570b81ff1`; macOS 26.6.2 arm64, Apple M4 Max, 48 GiB; Codex in-app browser.

This is an engine compatibility finding. The failure is isolated to the tested build, model, GPU path and hardware; ownership may be in the engine/core rather than atc.

## Reproduce

1. Install Atomic Prism prism-b10826-c9c34bc macos-arm64.
2. Load LiquidAI/LFM2.5-1.2B-Instruct-Q4_K_M with default GPU settings on Apple M4 Max.
3. Compare the same model on upstream llama.cpp b11946.
4. In Atomic Prism settings add -ngl 0 and repeat.

## Expected

The model loads, or an unsupported combination is rejected before the engine crashes.

## Observed and impact

Prism aborts in ggml-metal-context.m:315 with GGML_ASSERT(buf_src). The UI reports the crash and reenables controls after approximately 38 seconds. Upstream on GPU and Prism on CPU both load and answer successfully.

## Mechanism

The evidence isolates the failure to the tested Prism/Metal/model combination; the underlying engine defect has not been fixed or generalized to other models/hardware.

## Source pointers

The direct engine crash log is the evidence; no atc root cause is asserted.

## Evidence

- [prism-direct-start.log](../evidence/2026-10-29-pass-01/prism-direct-start.log)
- [prism-cpu-success.png](../evidence/2026-10-29-pass-01/prism-cpu-success.png)

## Follow-up: pass 04

[Pass 04](../sessions/2026-10-29-pass-04.md) reproduced the same `GGML_ASSERT(buf_src)` at `ggml-metal-context.m:315` with `LiquidAI/LFM2-1.2B-Q4_K_M` on the same M4 Max and Prism build, using a fresh real Prism installation. Default GPU load failed; `-ngl 0 -c 1024` with four threads loaded and generated successfully. Upstream and TurboQuant also generated with this model. This extends the tested model scope; it is not a new defect or a claim about all LFM2 models.

- [Additional Metal assertion](../evidence/2026-10-29-pass-04/B05-LFM2-Metal-assert.log).
- [API remains up after failed switch, with no loaded model](../evidence/2026-10-29-pass-04/failed-Prism-GPU-switch.json).
- [Prism CPU process, settings and API route](../evidence/2026-10-29-pass-04/Prism-CPU-same-model.json).

## Resolution

No fix applied. A fix needs a linked change and a new verification session before this finding is marked verified fixed.

## Fix scope review

The [fix session](../sessions/2026-10-29-fixes.md) leaves this finding open. The assertion occurs inside the Prism Metal backend; Atomic Server already reports the failure and permits retry. Fixing it here would duplicate core/engine compatibility policy or hide the defect behind a CPU fallback. No engine binaries, core pin or compatibility rules were changed.
