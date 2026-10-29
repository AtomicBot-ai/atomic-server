# B10 — Search message text matches JSON field names absent from every message

- **Status:** Fixed — verified by regression tests in this change. See the [fix validation session](../sessions/2026-10-29-fixes.md).
- **Priority:** P2.
- **First observed:** [2026-10-29, pass 03](../sessions/2026-10-29-pass-03.md).
- **Environment:** Atomic Server 0.2.8 / core 0.19.1, built commit `609ce03db0f1`, admin build `8c7fb29570b81ff1`; macOS 26.6.2 arm64; interactive Codex in-app browser. Minimal confirmation used a second fresh server without an engine: inference is not needed for history search.

## Minimal reproduction

1. Save one chat titled `QA03 minimal search`, containing user text `HELLO_879` and assistant text `WORLD_321`. The session seeded this through `history.import`.
2. Open Playground > Search conversations.
3. Enter `content`. The title search correctly shows no conversations.
4. Click Search message text.
5. Open the returned conversation and inspect its messages.

## Expected

No match: neither the title nor the messages contain `content`. Search message text must search the visible text rather than structural property names in its storage format.

## Observed and impact

The chat is returned even though its only message bodies are `HELLO_879` and `WORLD_321`. On the larger 203-chat fixture, both `content` and `role` return all 203 chats; neither term appears in any title or message body. A positive control for `QA03 JSONL user` correctly returns only the two conversations containing that text.

Common search words such as `content`, `role` and `assistant` can yield unrelated results, defeating the message-search control. No data loss or inference failure is claimed.

## Mechanism

The message-text search applies `JSON.stringify([chat.title, chat.messages])` before substring matching. Serialized message objects contain the keys `role` and `content`, so the storage schema becomes searchable as if it were conversation text.

## Source pointers

- [Serialized-object substring search](../../../packages/admin-ui/src/workspace/chat/ChatHistorySearch.tsx#L68).

## Evidence

- [One-chat false match](../evidence/2026-10-29-pass-03/B10-minimal-false-match.png).
- [Its actual message bodies](../evidence/2026-10-29-pass-03/B10-minimal-actual-messages.png).
- [203 false matches](../evidence/2026-10-29-pass-03/B10-content-false-matches.png).
- [Positive text-search control](../evidence/2026-10-29-pass-03/B10-real-text-control.png).
- [Durable-data oracle and observed result counts](../evidence/2026-10-29-pass-03/B10-search-oracle.json).

## Resolution

No fix applied. A fix needs a linked change and a new verification session before this finding is marked verified fixed.

## Local fix verification

The original discovery status was: Open — confirmed with two absent search terms and a separate one-chat minimal reproduction.

The implementation is in [conversation-search.ts](../../../src/workspace-view/chat/conversation-search.ts); supporting changes, regression tests, browser/API evidence and verification limits are recorded in the [fix validation session](../sessions/2026-10-29-fixes.md). The original evidence above describes the unfixed build and is retained.
