# B03 — A stale second tab silently replaces newer chat messages

- **Status:** Fixed — verified by regression tests in this change. See the [fix validation session](../sessions/2026-10-29-fixes.md).
- **Priority:** P1.
- **First observed:** [2026-10-29, pass 01](../sessions/2026-10-29-pass-01.md).
- **Reproduction evidence:** confirmed twice in live browser.
- **Environment:** Atomic Server 0.2.8, core 0.19.1, product commit `41cc1f776e31`, admin build `8c7fb29570b81ff1`; macOS 26.6.2 arm64, Apple M4 Max, 48 GiB; Codex in-app browser.

## Reproduce

1. Create a chat and open it in two tabs.
2. Prepare distinct messages A and B; verify the text in each composer.
3. Send A and immediately send B before the second tab adopts the newly saved history.
4. Wait for completion and reopen the conversation.

## Expected

Both accepted turns survive, or a stale write is rejected or explicitly branched.

## Observed and impact

Only B survives. A vanished in both tabs and in the durable conversation JSON. No conflict warning.

## Mechanism

chat.start loads the current conversation but replaces its messages with the client-supplied snapshot without a version/prefix check. The active-request guard does not prevent a stale write just after a fast prior request completes.

## Source pointers

- [src/workspace-service/chat/chat-jobs.ts:92](../../../src/workspace-service/chat/chat-jobs.ts#L92)

## Evidence

- [concurrent-history-evidence.json](../evidence/2026-10-29-pass-01/concurrent-history-evidence.json)
- [concurrent-chat-after.png](../evidence/2026-10-29-pass-01/concurrent-chat-after.png)

## Resolution

No fix applied. A fix needs a linked change and a new verification session before this finding is marked verified fixed.

## Local fix verification

The original discovery status was: Open — confirmed.

The implementation is in [history.ts](../../../src/terminal-data/history.ts); supporting changes, regression tests, browser/API evidence and verification limits are recorded in the [fix validation session](../sessions/2026-10-29-fixes.md). The original evidence above describes the unfixed build and is retained.
