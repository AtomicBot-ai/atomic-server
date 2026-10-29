# B12 — Engine presets save unsupported enum values while the form shows valid options

- **Status:** Fixed — verified by regression tests in this change. See the [fix validation session](../sessions/2026-10-29-fixes.md).
- **Priority:** P2.
- **First observed:** [2026-10-29, pass 04](../sessions/2026-10-29-pass-04.md).
- **Environment:** Atomic Server 0.2.8 / core 0.19.1, build `609ce03db0f1`, admin build `8c7fb29570b81ff1`; macOS 26.6.2 arm64; llama.cpp upstream b11946; interactive browser and actual engine process checks.

## Reproduce

1. Open llama.cpp Engine settings > Import / export engine configuration.
2. Import an `atomic-engine-settings-v1` preset for `llamacpp-upstream`, containing `values: {"cache_type_k":"qa-invalid-cache"}` (the tested file also restored `flash_attn` to `auto` after the first probe).
3. Review and Save changes. Reopen/review the KV Cache K Type field.
4. Reload a real model and compare the saved setting, selected UI option and process arguments.
5. Repeat with `values: {"flash_attn":"qa-invalid-mode"}`.

## Expected

Reject an unsupported enum value before saving, or show it explicitly as unsupported and require correction. A successful save and a valid selected option must not hide a different durable value.

## Observed and impact

Both invalid values are accepted and persisted. The KV Cache K Type control shows `f32` (its first valid option), but `settings.get` returns `qa-invalid-cache`; the real reload uses `--cache-type-k q8_0`. Flash Attention shows `auto` while its durable value is `qa-invalid-mode`; the real reload omits the Flash Attention flag.

Neither reload crashed: the runtime used fallback behavior. The defect is a misleading configuration/review path, not an asserted startup failure. A preset from a different engine build can silently save unsupported enum choices while appearing valid in the form, and the launched parameters need not match the displayed choice. Explicitly choosing a supported option restored the saved values, which survived server restart.

## Mechanism

Preset import checks format, provider and known setting keys, but not whether enum values belong to descriptor options. Save validates numeric fields and the MTP/DFlash conflict, but not enums. A native select bound to a value absent from its options displays a valid first option rather than the invalid saved value.

## Source pointers

- [Preset staging and Save validation](../../../packages/admin-ui/src/workspace/library/engines/EngineSettings.tsx#L191).
- [Select bound to imported value](../../../packages/admin-ui/src/workspace/library/engines/EngineSettingField.tsx#L54).

## Evidence

- [Flash Attention test preset](../evidence/2026-10-29-pass-04/B12-invalid-flash-preset.json).
- [KV-cache test preset](../evidence/2026-10-29-pass-04/B12-invalid-cache-preset.json).
- [Flash Attention shown as auto after save](../evidence/2026-10-29-pass-04/B12-invalid-enum-saved-as-auto.png).
- [Invalid cache setting shown as f32](../evidence/2026-10-29-pass-04/B12-invalid-cache-shown-f32.png).
- [Saved values and observed UI/runtime comparison](../evidence/2026-10-29-pass-04/B12-saved-invalid-enums.json).
- [Actual process after KV-cache reload](../evidence/2026-10-29-pass-04/invalid-enum-runtime.json).
- [Supported values restored and persisted through restart](../evidence/2026-10-29-pass-04/settings-after-restart.json).

## Resolution

Test configuration restored; no product fix applied. A fix needs a linked change and a new verification session before this finding is marked verified fixed.

## Local fix verification

The original discovery status was: Open — confirmed with Flash Attention and KV Cache K Type, including real reloads.

The implementation is in [settings-validation.ts](../../../src/workspace-view/engines/settings-validation.ts); supporting changes, regression tests, browser/API evidence and verification limits are recorded in the [fix validation session](../sessions/2026-10-29-fixes.md). The original evidence above describes the unfixed build and is retained.
