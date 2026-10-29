# B14 — TUI Back replaces a non-default first-model selection

- **Status:** Fixed locally on `ec52295` plus uncommitted TUI fixes; see [fix validation](../sessions/2026-10-29-tui-fixes.md).
- **Priority:** P2.
- **Session:** [Pass 05](../sessions/2026-10-29-pass-05-tui.md).
- **Build:** Atomic Server 0.2.8, core 0.19.1, binary `add2a30be85b`, macOS arm64, 120×40 PTY. [Identity](../evidence/2026-10-29-pass-05-tui/build-identity.json).
- **Related finding:** B01's web path is fixed; this is the independent terminal state transition.

## Reproduce

1. On a fresh TUI onboarding state with multiple installed models, select the second model (LFM2.5 GGUF), then Continue.
2. On Permissions, press Esc (the footer calls this Back).
3. Inspect the model radio selection, then Continue without choosing another model.

Repeat using the third model, LFM2.5 MLX.

## Expected and observed

The previously chosen model should remain selected across Back. Instead, the first LFM2 GGUF row is selected after both returns. A subsequent Continue writes that first model to `tui.model`, so the UI silently changes the user's choice rather than merely moving keyboard focus.

## Evidence and mechanism

- [Second model selected](../evidence/2026-10-29-pass-05-tui/B14-second-selected.txt), [Back reset](../evidence/2026-10-29-pass-05-tui/B14-back-reset.txt).
- [MLX selected](../evidence/2026-10-29-pass-05-tui/B14-MLX-selected.txt), [repeat reset](../evidence/2026-10-29-pass-05-tui/B14-repeat-reset.txt), [final config selection](../evidence/2026-10-29-pass-05-tui/B14-final-selection.json).

`firstRunAction('first-back')` returns through `first-model`, which invokes `setupAction('hosting')`. That replaces the setup view with `newSetup` and drops `firstChoice`. `selectedFirstModel` then defaults to the first row. Source: `src/tui/workspace/setup/first-run.ts`, `setup-actions.ts`, `first-model.ts`.

No fix or maintained regression test was added in this discovery pass. No known-good terminal release was established, so no historical bisect was performed. A regression should assert both the selected radio and saved `tui.model` after Back/Continue.
