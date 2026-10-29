# B04 — Reconnect deletes the unsent message it offers to recover

- **Status:** Fixed — verified by regression tests in this change. See the [fix validation session](../sessions/2026-10-29-fixes.md).
- **Priority:** P2.
- **First observed:** [2026-10-29, pass 01](../sessions/2026-10-29-pass-01.md).
- **Reproduction evidence:** confirmed after an outage and with a minimal local validation error.
- **Environment:** Atomic Server 0.2.8, core 0.19.1, product commit `41cc1f776e31`, admin build `8c7fb29570b81ff1`; macOS 26.6.2 arm64, Apple M4 Max, 48 GiB; Codex in-app browser.

## Reproduce

1. In Run settings, expand Additional engine parameters & tools and put { in Request JSON.
2. Type DRAFT_RECOVERY_KEEP_879 and press Send.
3. Observe the validation error saying your message is kept.
4. Click Reconnect, return to Playground, and reopen the same conversation.

## Expected

The recovery action preserves the unsent message or warns before discarding it.

## Observed and impact

The composer becomes empty. Also reproduced with a failed Send during server outage.

## Mechanism

Reconnect calls window.location.reload(); drafts live only in a module-level Map.

## Source pointers

- [packages/admin-ui/src/workspace/chat/ChatTurnStatus.tsx:42](../../../packages/admin-ui/src/workspace/chat/ChatTurnStatus.tsx#L42)
- [packages/admin-ui/src/workspace/chat/chat-draft.ts:9](../../../packages/admin-ui/src/workspace/chat/chat-draft.ts#L9)

## Evidence

- [reconnect-before.png](../evidence/2026-10-29-pass-01/reconnect-before.png)
- [reconnect-after.png](../evidence/2026-10-29-pass-01/reconnect-after.png)

## Resolution

No fix applied. A fix needs a linked change and a new verification session before this finding is marked verified fixed.

## Local fix verification

The original discovery status was: Open — confirmed.

The implementation is in [chat-draft.ts](../../../packages/admin-ui/src/workspace/chat/chat-draft.ts); supporting changes, regression tests, browser/API evidence and verification limits are recorded in the [fix validation session](../sessions/2026-10-29-fixes.md). The original evidence above describes the unfixed build and is retained.
