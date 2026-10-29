# B09 — Export all produces a history file the importer refuses above 100 conversations

- **Status:** Fixed — verified by regression tests in this change. See the [fix validation session](../sessions/2026-10-29-fixes.md).
- **Priority:** P2.
- **First observed:** [2026-10-29, pass 03](../sessions/2026-10-29-pass-03.md).
- **Environment:** Atomic Server 0.2.8 / core 0.19.1, built commit `609ce03db0f1`, admin build `8c7fb29570b81ff1`; macOS 26.6.2 arm64; interactive Codex in-app browser; fresh isolated data.

## Reproduce

1. Save 101 small conversations in the workspace (this session imported 2 through the browser, then seeded another 99 through `history.import`).
2. In Playground > History options > Import / export choose Export all conversations.
3. Select that unmodified exported JSON using Import conversations (JSON / JSONL).
4. Confirm the dialog titled Import 101 conversations?.
5. Retry Import; compare a copy of the file containing only its first 100 conversations.

## Expected

The application's complete history export should be restorable through its import UI. A bounded importer can split the export into supported batches or the exporter can produce an explicitly supported restore format; the two controls must agree.

## Observed and impact

Export succeeds and produces a valid `atomic-conversations-v1` file containing all 101 conversations (41,634 bytes, including one archived chat). The UI offers to import 101, then rejects it with `Import between 1 and 100 conversations at a time.` Retry has the same result; the saved count remains 101. Reducing only the array length to 100 lets the browser import succeed, raising the saved count to 201.

A user with more than 100 chats cannot restore or transfer the complete export without manually editing JSON. This is a mismatch between export and import, not a request to remove all import resource limits. No partial write was observed.

## Mechanism

The exporter loads every entry in `s.recents` and writes them into one file. The shared importer rejects arrays longer than 100. The browser does not split a large own-format export into batches.

## Source pointers

- [Unbounded full-history export](../../../packages/admin-ui/src/workspace/chat/ChatHistory.tsx#L76).
- [Import count limit](../../../src/workspace-service/chat/history-transfer.ts#L5).
- [One import operation for the entire file](../../../packages/admin-ui/src/workspace/chat/ImportConversationsDialog.tsx#L24).

## Evidence

- [Unmodified browser export](../evidence/2026-10-29-pass-03/export-101.json.txt).
- [Boundary counts and raw export SHA-256](../evidence/2026-10-29-pass-03/B09-boundary-results.json).
- [Browser rejection](../evidence/2026-10-29-pass-03/B09-own-export-rejected.png).
- [Invalid-batch control and 99-chat seed](../evidence/2026-10-29-pass-03/import-invalid-batch-and-recovery.json).

## Resolution

No fix applied. A fix needs a linked change and a new verification session before this finding is marked verified fixed.

## Local fix verification

The original discovery status was: Open — confirmed twice, with a passing 100-conversation boundary control.

The implementation is in [history-transfer.ts](../../../src/workspace-service/chat/history-transfer.ts); supporting changes, regression tests, browser/API evidence and verification limits are recorded in the [fix validation session](../sessions/2026-10-29-fixes.md). The original evidence above describes the unfixed build and is retained.
