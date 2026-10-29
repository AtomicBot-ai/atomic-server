# B16 — TUI engine picker cannot represent a running MLX model

- **Status:** Fixed locally and verified — [follow-up fix validation](../sessions/2026-10-29-tui-follow-up-fixes.md).
- **Priority:** P2.
- **Session:** [Pass 05](../sessions/2026-10-29-pass-05-tui.md).
- **Build:** Atomic Server 0.2.8, core 0.19.1, binary `add2a30be85b`, macOS arm64, 120×40 PTY. [Identity](../evidence/2026-10-29-pass-05-tui/build-identity.json).

## Reproduce

1. Have upstream llama.cpp, TurboQuant and MLX installed, with a GGUF model and an MLX checkpoint downloaded.
2. In Playground, choose the GGUF model and select TurboQuant through Choose model → Inference engine. Wait until the real model loads.
3. Choose the MLX model through the model picker. Wait for “Model loaded.”
4. Reopen Choose model → Inference engine.

## Expected and observed

The engine picker should offer installed, compatible chat engines including MLX, and its current marker should agree with the model/engine the TUI just loaded. Instead, MLX has no row at all. After the explicit TurboQuant → MLX model switch, the picker still marks TurboQuant current while the only running server service is MLX and the composer names the MLX model.

This prevents selecting MLX by engine and misrepresents the completed switch. Choosing an already downloaded MLX model directly is a working workaround; actual MLX inference was verified in this session. This is separate from B13's download registration defect, which did not reproduce here.

## Evidence and mechanism

- [Picker after loading MLX](../evidence/2026-10-29-pass-05-tui/B16-MLX-engine-picker.txt): TurboQuant is checked, MLX is absent.
- [Installed MLX build](../evidence/2026-10-29-pass-05-tui/B16-installed-MLX.json), [only running service is MLX](../evidence/2026-10-29-pass-05-tui/B16-live-services.json), [MLX load completed](../evidence/2026-10-29-pass-05-tui/B16-MLX-loaded.txt).
- [Earlier engine picker](../evidence/2026-10-29-pass-05-tui/engine-picker-before-MLX.txt) also omits MLX; closing and reopening does not repair it.

`EngineSelection.list` joins llama.cpp catalog builds with only `managed`, `foundry` and `litert` families, excluding MLX. Selecting a single-provider installed model does not update `state.engine`; the engine picker computes `current` from that older field. Source: `src/terminal-setup/engines.ts`, `src/tui/workspace/chat/model-selection.ts`, `src/tui/workspace/chat/picker.ts`.

No fix, maintained regression test or historical bisect was added in this discovery pass. A regression should combine actual engine-list data with model selection, then assert MLX membership and the current marker after switching formats.

## Pass 06 — remaining full-ID preference path

On the B14–B16 fixed binary (base `ec52295`, core 0.19.1), a second authenticated client calls `engines.select` with `engine: mlx`. That operation saves `mlx|mlxvlm-macos-arm64-07ba5a1|macos-arm64`. Restarting TUI and opening Playground → Choose model → Inference engine shows the MLX row without its current marker, despite the server reporting a ready MLX session.

`EngineSelection.list` represents MLX with the provider-only ID `mlx`, while `engines.select` persists a full build ID. The corrected picker handles a provider-only preference for llama.cpp, but the reverse case—a full non-llama preference—still matches neither its row ID nor its provider. This is a remaining selection-ID variant of B16, not a new finding ID. The working single-provider model-selection case and its passing evidence are retained.

Confirmed across two independent TUI launches: [run 1](../evidence/2026-10-29-pass-06-tui/B16-full-id-run-1.json), [run 2](../evidence/2026-10-29-pass-06-tui/B16-full-id-run-2.json), [picker](../evidence/2026-10-29-pass-06-tui/B16-full-id-picker.txt), [PTY probe](../evidence/2026-10-29-pass-06-tui/B16-full-id-reproduce.py).

## Follow-up fix verification

The picker now resolves an exact build ID first, then an explicit provider row. Provider-only llama.cpp preferences still use the core active build; a missing explicit llama.cpp build is not silently relabeled. A fresh real PTY launch with the full MLX ID and a ready MLX service marks MLX current. Unit tables and real Ink/workspace transport cover the full-ID path. [Passing result](../evidence/2026-10-29-tui-follow-up-fixes/B16-full-id-result.json).
