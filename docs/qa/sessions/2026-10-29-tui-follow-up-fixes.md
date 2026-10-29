# TUI follow-up fixes — B16–B19

## Scope

Fixed the three [Pass 06](2026-10-29-pass-06-tui.md) findings and the remaining B16 full-ID preference variant on `codex/tui-qa-fixes`, based on `ec52295b5264`. Earlier B14–B16 changes remain on this branch. No commit, push, core change, dependency change or history/settings revision-policy change was made. Unrelated work in the original checkout was left intact.

## Behavior and regression checks

- **B17:** A validated endpoint is a new selection in the existing revision/serialized-save mechanism. It clears obsolete load feedback, preserves the draft and supersedes late callbacks. Queue ordering also covers a model preference write already in progress. Invalid URL input does not cancel a valid pending choice. Reversing the race cannot close a newer picker. Unit tests defer loads and writes independently; real Ink plus the workspace service confirms the new connection survives the old load.
- **B18:** Generic editors render the action error beside retained input. Pointer movement preserves that error. Opening attachment editors and successfully attaching a document clear old feedback. Unit tests cover endpoint, document, image and config editors at 54×24 and 120×40. Real Ink/service and maintained binary PTY tests cover refusal and correction.
- **B19:** Rendering and input share the complete Tools list. Keyboard and wheel navigate hidden rows; headings are not focusable and the viewport follows the selected item. Tests cover twenty skills plus a trailing connector, toggling, reverse movement, footer controls, page bounds, disabled mouse, Escape and Quit. A contract journey and binary PTY toggle the twentieth skill in a compact terminal.
- **B16:** The picker matches an exact engine build, then an explicit provider row. Provider-only llama.cpp choices may use the active build reported by core; an unknown explicit build is not silently changed. Unit tables and a fresh Ink/service launch cover a full MLX ID saved by `engines.select` from another client.

Tests were added before the fixes. The initial four-file run produced **10 behavioral failures and 10 passing controls**. All of those failures now pass, with additional reverse-order/navigation guards.

## Live verification

macOS arm64, core 0.19.1, the final binary from `ec52295` plus these uncommitted changes. [Build identity](../evidence/2026-10-29-tui-follow-up-fixes/build.json): SHA-256 `65cfb897487600186381a7b5465b1ef860df2eb9749eb1e8f60c912208dd52ef`. Runs used the retained disposable `atomic-qa-*` workspace with official installed MLX binaries and weights. Normal automated suites use fakes/loopback fixtures and do not start real inference engines.

- **B17:** Saved a unique closed-loopback endpoint while a real cold load of `mlx-community/LFM2.5-1.2B-Instruct-4bit` was still pending. Asserted MLX was not ready at save time, then waited for the server to report it ready. The before/after config retained the new endpoint and empty model; the screen retained the draft and connection message, without reviving “Model loaded” or loading feedback. Exit 0. [Result shared with B18](../evidence/2026-10-29-tui-follow-up-fixes/B17-B18-result.json), [after old load](../evidence/2026-10-29-tui-follow-up-fixes/B17-new-endpoint-after-old-load.txt).
- **B18:** Missing-document and malformed-URL errors appeared in their open editors. Correcting the path attached the synthetic notes file without the old ENOENT warning. [Document error](../evidence/2026-10-29-tui-follow-up-fixes/B18-visible-document-error.txt), [recovery](../evidence/2026-10-29-tui-follow-up-fixes/B18-recovered-document.txt), [URL error](../evidence/2026-10-29-tui-follow-up-fixes/B18-visible-URL-error.txt).
- **B19:** The original twenty-skill navigation probe now reaches all twenty labels by Tab/arrows/wheel at 120×40 and by Tab at 54×24. [Result](../evidence/2026-10-29-tui-follow-up-fixes/B19-20-skills-navigation-result.json). The maintained PTY also activates the final skill.
- **B16:** A fresh TUI launch with saved `mlx|mlxvlm-macos-arm64-07ba5a1|macos-arm64` marks MLX current while the real MLX service is ready. [Result](../evidence/2026-10-29-tui-follow-up-fixes/B16-full-id-result.json), [picker](../evidence/2026-10-29-tui-follow-up-fixes/B16-full-id-picker.txt).

Original failing states are retained. Publication removes trailing whitespace and surplus blank lines from text captures; visible content and leading columns are unchanged. Replay scripts and synthetic frames are in the [follow-up evidence directory](../evidence/2026-10-29-tui-follow-up-fixes/README.md). The QA-owned server and model workers were stopped after validation.

## Gates and limits

- Full unit/contract: **396 files, 2,856 tests passed**.
- Web UI: **114 files, 439 tests passed**.
- Binary e2e: **46 passed, 3 platform/service cases skipped**.
- Browser e2e: **18 passed**.
- Runtime compatibility: **6 passed on Node and 6 on Bun**.
- Installers: **16 passed, 2 PowerShell cases skipped on macOS**.
- Lint, module boundaries, typecheck, notices and TypeScript/SPA/macOS binary builds passed. Formatting of changed files passed.

`npm run verify` stops at 12 existing Prettier violations in `main`. Each offending file was checked byte-for-byte against `HEAD`; none was changed here. The later gates were run explicitly with the passing results above. The files are `src/admin/{bff.test,static}.ts`, `src/commands/models/host-step-terminal.ts`, `src/daemon/restrict-data.test.ts`, `src/downloads/{local,ranges,single}.ts`, `src/host/{elevator.test,exec.test,facts.test,facts}.ts`, and `src/update/trust.test.ts`.

Initial harness failures are not omitted: the new fake-terminal Tools journey lost rapid input between React/Ink listener effects under the full suite. Awaiting React `act` for input events fixed the test synchronization without changing its assertions. A pre-existing `terminal-download-handoff` scheduling assertion failed once under concurrent checks, then passed on both later full runs; its source was not changed. Initial PTY expectations also assumed Node's exact URL error text on Bun and clicked using stale geometry after resize. The maintained binary test now uses a deterministic invalid scheme and opens Tools before resizing; the live malformed-URL probe accepts either runtime's actual error wording. Final full runs passed.

Linux/Windows terminal behavior remains unverified locally. Preference writes are ordered within one TUI controller, not a cross-client transaction. Changing client intent does not cancel a server-owned model load; its eventual readiness remains visible in server state. No new downloads, privileged service operations or real connector side effects were exercised in this fix pass.

See the [decision record](../../decisions/2026-10-29-terminal-selection-and-popup-navigation.md).
