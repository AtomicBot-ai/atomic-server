# Exploratory QA findings

A cumulative, repository-local ledger of evidence-backed Atomic Server defects and QA infrastructure failures. Product fixes are tracked separately from discovery.

## Open findings

- **B05 · P2** — [Atomic Prism crashes on Metal with the tested LFM2/LFM2.5 models; CPU and upstream work](findings/B05-prism-metal-model-crash.md).

## Fixes — verified

[Fix validation, tests and remaining limits](sessions/2026-10-29-fixes.md).

- **B13 · P2** — [A fresh MLX download is absent from the chat loader until its first catalog load](findings/B13-downloaded-MLX-missing-from-chat-loader.md).
- **B12 · P2** — [Engine presets save invalid enums while displaying valid choices](findings/B12-engine-preset-accepts-invalid-enums.md).
- **B11 · P2** — [MLX search uses the GGUF filter and loses matching MLX checkpoints](findings/B11-MLX-search-uses-GGUF-filter.md).
- **B10 · P2** — [Message text search matches JSON field names absent from the messages](findings/B10-message-search-matches-json-field-names.md).
- **B09 · P2** — [Export all exceeds the importer’s 100-conversation limit](findings/B09-export-all-exceeds-import-limit.md).
- **B08 · P2 · Test infrastructure** — [The PTY helper inherits TERM=dumb and falsely fails terminal journeys](findings/B08-pty-helper-inherits-dumb-terminal.md).
- **B07 · P2** — [Creating a skill with an existing name silently replaces its instructions](findings/B07-create-skill-overwrites-existing.md).
- **B03 · P1** — [A stale second tab silently replaces newer chat messages](findings/B03-stale-chat-history-overwrite.md).
- **B02 · P2** — [An accepted API prefix can break every endpoint with HTTP 404](findings/B02-api-prefix-breaks-routes.md).
- **B04 · P2** — [Reconnect deletes the unsent message it offers to recover](findings/B04-reconnect-loses-draft.md).
- **B06 · P2** — [Searching a catalog model by its displayed title loses the matching result](findings/B06-catalog-title-search-loses-match.md).
- **B01 · P2** — [Back resets the selected first model to a different recommendation](findings/B01-back-resets-first-model.md).

## Sessions

- [2026-10-29 — local fixes and regression verification](sessions/2026-10-29-fixes.md).
- [2026-10-29, pass 01 — onboarding, real engines, downloads and recovery](sessions/2026-10-29-pass-01.md).
- [2026-10-29, pass 02 — workspace edits, cancellation and history](sessions/2026-10-29-pass-02.md).
- [2026-10-29, pass 03 — history transfer boundaries, malformed files and message search](sessions/2026-10-29-pass-03.md).
- [2026-10-29, pass 04 — real engine installation, model/engine switching and settings](sessions/2026-10-29-pass-04.md).

## Keeping the ledger useful

- Keep IDs stable. The next new finding is **B14**; do not renumber existing findings.
- Reproduce a candidate, establish its expected behavior, check for duplicates, then add one finding file and link it here.
- Keep unconfirmed observations and blocked checks in the session log, outside the confirmed finding list.
- Record exact builds, environment, preconditions, actions, expected/observed results and evidence. Mark source explanations as hypotheses when not established.
- Update an existing finding when a new pass adds evidence; use a new ID only for a different defect.
- Mark a finding verified fixed only after linking a fix and recording a passing reproduction on the fixed build. Preserve the original evidence.
- Store only synthetic test data and redacted logs/screenshots. Never add tokens, credentials, model weights or engine binaries.
- See [the testing guide](../testing.md) and the local `atomic-qa` skill for isolation and investigation practices.
